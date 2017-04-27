'use strict';

// Usage reporting service.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const transform = require('abacus-transform');
const schemas = require('abacus-usage-schemas');
const mconfigcb = require('abacus-metering-config');
const rconfigcb = require('abacus-rating-config');
const schema = require('abacus-schema');
const oauth = require('abacus-oauth');
const seqid = require('abacus-seqid');
const dataflow = require('abacus-dataflow');
const timewindow = require('abacus-timewindow');
const moment = require('abacus-moment');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const omit = _.omit;
const map = _.map;
const extend = _.extend;
const filter = _.filter;
const reduce = _.reduce;
const zip = _.zip;
const unzip = _.unzip;
const contains = _.contains;
const first = _.first;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

const mconfig = yieldable(mconfigcb);
const rconfig = yieldable(rconfigcb);

const graphql = schema.graphql.graphql;
const GraphQLSchema = schema.graphql.GraphQLSchema;
const GraphQLObjectType = schema.graphql.GraphQLObjectType;
const GraphQLNonNull = schema.graphql.GraphQLNonNull;
const GraphQLString = schema.graphql.GraphQLString;
const GraphQLFloat = schema.graphql.GraphQLFloat;
const GraphQLList = schema.graphql.GraphQLList;

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');
const edebug = require('abacus-debug')('e-abacus-usage-reporting');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;

const dbaliasAggregator = process.env.DBALIAS_AGGREGATOR || 'db';
const dbaliasAccumulator = process.env.DBALIAS_ACCUMULATOR || 'db';

// Resolve service URIs
const uris = urienv({
  account: 9881,
  auth_server: 9882,
  [dbaliasAggregator]: 5984,
  [dbaliasAccumulator]: 5984
});

// Configure rated usage db
const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage',
  undefined, uris[dbaliasAggregator]);
// Configure accumulated usage db
const accumulatordb = dataflow.db('abacus-accumulator-accumulated-usage',
  undefined, uris[dbaliasAccumulator]);

// Time dimensions
const dimensions = ['s', 'm', 'h', 'D', 'M'];

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () => /^[0-9]+[MDhms]$/.test(process.env.SLACK) ? {
  scale : process.env.SLACK.charAt(process.env.SLACK.length - 1),
  width : process.env.SLACK.match(/[0-9]+/)[0]
} : {
  scale : 'm',
  width : 10
};

// Calculates the max number of time windows in a given time scale based on
// the slack's configuration
const maxSlack = (w) => {
  const slackscale = {
    M: { 4: 1 },
    D: { 4: 28, 3: 1 },
    h: { 4: 672, 3: 24, 2: 1 },
    m: { 4: 40320, 3: 1440, 2: 60, 1: 1 },
    s: { 4: 2419200, 3: 86400, 2: 3600, 1: 60, 0: 1 }
  };
  if(slack().scale && slackscale[slack().scale][w])
    return map(Array(Math.ceil(1 / slackscale[slack().scale][w] * slack().width)
      + 1), () => null);
  return [null];
};

// The window length based on the configured slack.
const findWindowLength = () => map([maxSlack(0),
  maxSlack(1), maxSlack(2), maxSlack(3), maxSlack(4)], (w) => w.length);

// Adjust the windows to the desired t
const adjustWindows = (windows, ct, t, wl) => map(timewindow.adjustWindows(
  windows, ct, t), (w, i) => first(w, wl[i]));

// Return the charge function for a given plan and metric
const chargefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].chargefn;
};

// Return the summarize function for a given metric
const summarizefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].summarizefn;
};

// Reduce function that can be used to compute the sum of a list of charges
const sumCharges = (a, m) => {
  if(a)
    a.charge = new BigNumber(a.charge)
      .add(m && m.charge ? m.charge : 0).toNumber();
  else if(m && 'charge' in m)
    return { charge: m.charge };
  return a;
};

// Calculates the charge for a metric under a plan
// Given the query time, metric object, charge function, usage processed time
const chargePlanMetric = (t, metric, processed, cfn) => {
  // Traverse and calculate/copy every single window + slack
  return extend({}, metric, {
    windows: map(metric.windows, (w, i) => {
      return map(w, (s, j) => {
        // Calculate the from and to bounds of the window
        const bounds = timewindow.timeWindowBounds(
          processed, dimensions[i], -j);
        // Return the charge, return null if it's undefined
        return s ? cfn ? extend({}, s, {
          charge: cfn(t, s.cost, bounds.from, bounds.to)
        }) : extend({}, s) : null;
      });
    })
  });
};

// Computes the charge for aggregated usage across plans for specific
// Metric given the plans object.
const chargeAggregatedMetric = (metric, plans) => {
  // Filter the plan metrics to only include the current metric
  const planMetrics = map(plans, (p) => {
    return filter(p.aggregated_usage, (m) => m.metric === metric &&
      m.windows)[0];
  });
  return extend({ metric: metric }, {
    windows: map(planMetrics[0].windows, (w, i) => {
      return map(w, (s, j) => {
        const charge = reduce(planMetrics, (a, u) => {
          // Only add the plan usage window if it is defined.
          if(u && u.windows[i][j] && u.windows[i][j] !== null)
            return a !== null ? a + u.windows[i][j].charge :
              u.windows[i][j].charge;
          return a;
        }, null);
        return charge !== null ? { charge: charge } : charge;
      });
    })
  });
};

// Get rating plan
const getRatingPlan = function *(id, auth) {
  debug('Getting rating plan with id %s', id);
  const rplan = yield rconfig(id, auth);
  debug('Got rating plan %o', rplan);

  // Error when getting rating plan
  if(rplan.error) {
    edebug('Error when getting rating plan %s: %s', id, rplan.reason);
    throw extend({}, rplan, { statusCode: 200 });
  }

  return rplan.rating_plan;
};

// Get metering plan
const getMeteringPlan = function *(id, auth) {
  debug('Getting metering plan with id %s', id);
  const mplan = yield mconfig(id, auth);
  debug('Got metering plan %o', mplan);

  // Error when getting metering plan
  if(mplan.error) {
    debug('Error when getting metering plan %s: %s', id, mplan.reason);
    throw extend({}, mplan, { statusCode: 200 });
  };

  return mplan.metering_plan;
};

// Compute the charges for the given rated usage
const chargeUsage = function *(t, r, auth) {
  debug('Charging usage for time %o and rated usage %o', t, r);

  // Charge the rated usage under a resource
  const chargeResource = function *(rs) {
    // List all metrics used in the resource.
    let metrics = [];
    // Compute the charge of each metric under the resource's plans
    const plans = yield tmap(rs.plans, function *(p) {
      // Find the metrics configured for the given resource
      const rplan = yield getRatingPlan(p.rating_plan_id, auth);

      // Calculate the charges for all the metrics under a plan
      const cu = map(p.aggregated_usage, (m) => {
        // Fill in metrics if new metric is found
        if(!contains(metrics, m.metric))
          metrics.push(m.metric);

        // Find the charge function configured for each metric
        const cfn = chargefn(rplan.metrics, m.metric);

        return chargePlanMetric(t, m, r.processed, cfn);
      });

      // Return the metrics including the calculated charges and the
      // aggregated charge for the plan
      return extend({}, p, {
        aggregated_usage: cu,
        windows: map(zip.apply(_, map(cu, (u) => {
          return u.windows;
        })), (zu) => {
          return map(unzip(zu), (uu) => {
            return reduce(uu, sumCharges, null);
          });
        })
      });
    });

    // Return the resource's plans including the calculated charges and the
    // aggregated charge for the resource
    return extend({}, rs, {
      aggregated_usage: map(metrics, (m) => {
        return chargeAggregatedMetric(m, plans);
      }),
      plans: plans,
      windows: map(zip.apply(_, map(plans, (p) => {
        return p.windows;
      })), (zu) => {
        return map(unzip(zu), (uu) => {
          return reduce(uu, sumCharges, null);
        });
      })
    });
  };

  // Clone the rated usage and extend if with the computed charges
  const cr = yield tmap(r.resources, chargeResource);
  const c = extend({}, r, {
    windows: map(zip.apply(_, map(cr, (rs) => {
      return rs.windows;
    })), (zr) => {
      return map(unzip(zr), (uu) => {
        return reduce(uu, sumCharges, null);
      });
    }),
    resources: cr,
    spaces: yield tmap(r.spaces, function *(space) {
      const cr = yield tmap(space.resources, chargeResource);
      return extend({}, space, {
        windows: map(zip.apply(_, map(cr, (rs) => {
          return rs.windows;
        })), (zr) => {
          return map(unzip(zr), (uu) => {
            return reduce(uu, sumCharges, null);
          });
        }),
        resources: cr,
        consumers: yield tmap(space.consumers, function *(consumer) {
          const cr = yield tmap(consumer.resources, chargeResource);
          return extend({}, consumer, {
            windows: map(zip.apply(_, map(cr, (rs) => {
              return rs.windows;
            })), (zr) => {
              return map(unzip(zr), (uu) => {
                return reduce(uu, sumCharges, null);
              });
            }),
            resources: cr
          });
        })
      });
    })
  });
  debug('Charged usage %o', c);
  return c;
};

const chargeInstanceUsage = function *(t, r, auth) {
  debug('Charging instance usage for time %o and rated usage %o', t, r);

  // Find the metrics configured for the given resource
  const rplan = yield getRatingPlan(r.rating_plan_id, auth);
  const c = extend({}, r, {
    accumulated_usage: map(r.accumulated_usage, (m) => {
      return chargePlanMetric(t, m, r.processed,
        chargefn(rplan.metrics, m.metric));
    })
  });
  c.windows = map(zip.apply(_, map(c.accumulated_usage, (au) => au.windows)),
    (z) => map(unzip(z), (u) => reduce(u, sumCharges, null)));
  debug('Charged instance usage %o', c);
  return c;
};

// Summarize a metric
const summarizeMetric = (m, t, processed, sfn) => {
  // Clone the metric and extend with a usage summary
  return extend({}, m, {
    windows: map(m.windows, (w, i) => {
      return map(w, (wi, j) => {
        const bounds = timewindow.timeWindowBounds(
          processed, dimensions[i], -j);
        return wi ? sfn ? extend({}, wi, {
          summary: sfn(t, wi.quantity, bounds.from, bounds.to)
        }) : extend({}, wi) : null;
      });
    })
  });
};

// Compute usage summaries for the given aggregated usage
const summarizeUsage = function *(t, a, auth) {
  debug('Summarizing usage for time %o and aggregated usage %o', t, a);

  // Summarize the aggregated usage under a resource
  const summarizeResource = function *(rs) {
    // Clone the resource and extend it with usage summaries
    return extend({}, rs, {
      plans: yield tmap(rs.plans, function *(p) {
        // Find the metrics configured for the given metering plan
        const mplan = yield getMeteringPlan(p.metering_plan_id, auth);
        return extend({}, p, {
          aggregated_usage: map(p.aggregated_usage, (m) => {
            return summarizeMetric(m, t, a.processed,
              summarizefn(mplan.metrics, m.metric));
          })
        });
      })
    });
  };

  // Clone the aggregated usage and extend it with usage summaries
  const s = extend({}, a, {
    resources: yield tmap(a.resources, summarizeResource),
    spaces: yield tmap(a.spaces, function *(space) {
      return extend({}, space, {
        resources: yield tmap(space.resources, summarizeResource),
        consumers: yield tmap(space.consumers, function *(consumer) {
          return extend({}, consumer, {
            resources: yield tmap(consumer.resources, summarizeResource)
          });
        })
      });
    })
  });
  debug('Summarized usage %o', s);
  return s;
};

const summarizeInstanceUsage = function *(t, a, auth) {
  debug('Summarizing instance usage for time %o and aggregated usage %o', t, a);

  // Sets all quantities to their current quantity
  const setCurrentQuantity = (windows) => {
    map(windows, (w) => {
      map(w, (sw) => {
        if(sw)
          sw.quantity = sw.quantity.current;
      });
    });
  };

  // Find the metrics configured for the given metering plan
  const mplan = yield getMeteringPlan(a.metering_plan_id, auth);
  const s = extend({}, a, {
    accumulated_usage: map(a.accumulated_usage, (m) => {
      setCurrentQuantity(m.windows);
      return summarizeMetric(m, t, a.processed,
        summarizefn(mplan.metrics, m.metric));
    })
  });
  debug('Summarized instance usage %o', s);
  return s;
};

// Purge previous quantities
const purgeOldQuantities = (doc) => {
  const purgeInResource = (r) => {
    if(r.aggregated_usage)
      map(r.aggregated_usage, (au) => map(au.windows, (tw) => map(tw, (q) => {
        if(q)
          delete q.previous_quantity;
      })));
    map(r.plans, (p) => map(p.aggregated_usage,
    (au) => map(au.windows, (tw) => map(tw, (q) => {
      if(q)
        delete q.previous_quantity;
    }))));
  };
  map(doc.resources, (r) => purgeInResource(r));
  if(doc.spaces)
    map(doc.spaces, (s) => map(s.resources, (r) => purgeInResource(r)));
};

// Returns a copy of the passed in org usage with the consumers populated
const consumerUsage = function *(u) {

  // Collect the list of consumer ids to query for
  const ids = [];
  map(u.spaces, (s) => {
    map(s.consumers, (c) => {
      ids.push(['k', u.organization_id, s.space_id, c.id ,'t', c.t].join('/'));
    });
  });

  debug('Retrieving consumer usage for organization %o and consumers %o', 
    u.organization_id, ids);
  const consumers = (yield aggregatordb.allDocs({
    keys: ids, include_docs: true })).rows;

  // Return a copy of the usage data with consumer objects populated
  return extend({}, u, {
    spaces: map(u.spaces, (s) => {
      return extend({}, s, {
        consumers: map(s.consumers, (c) => {
          // Retrieve the consumer doc with the matching doc_id
          const consumer = filter(consumers,
            (con) => dbclient.k(con.doc._id) ===
              [u.organization_id, s.space_id, c.id].join('/'))[0].doc;
          purgeOldQuantities(consumer);
          // Shift all the windows
          map(consumer.resources, (resource) => {
            map(resource.plans, (plan) => {
              map(plan.aggregated_usage, (au) => {
                map(au.windows, (w, i) => {
                  timewindow.shiftWindow(consumer.processed, u.processed,
                    w, dimensions[i]);
                });
              });
            });
          });
          return omit(consumer,
            ['_id', 'id', '_rev', 'accumulated_usage_id',
              'processed', 'processed_id', 'resource_instance_id', 'start',
              'end', 'organization_id', 'resource_id', 'plan_id',
              'pricing_country', 'prices']);
        })
      });
    })
  });
};

// Return the usage for an org in a given time period
const orgUsage = function *(orgid, time, auth) {
  // Forward authorization header field to account to authorize
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = yield brequest.get(
    uris.account + '/v1/organizations/:org_id/account/:time', extend(o, {
      org_id: orgid,
      time: time
    }));

  // Authorization failed. Unable to retrieve account information
  // for the given organization
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Throw response object as an exception to stop further processing
    throw res;
  }

  // Compute the query range
  const t = time || moment.now();
  const d = moment.utc(t);
  const mt = moment.utc([d.year(), d.month(), 1]).valueOf();
  const sid = dbclient.kturi(orgid, seqid.pad16(t)) + 'ZZZ';
  const eid = dbclient.kturi(orgid, seqid.pad16(mt));

  debug('Retrieving latest rated usage between %s and %s', eid, sid);
  const doc = yield aggregatordb.allDocs({
    endkey: eid,
    startkey: sid,
    descending: true,
    limit: 1,
    include_docs: true
  });
  if(!doc.rows.length) {
    debug('No existing rated usage');

    // Return an empty usage report if no usage was found
    return {
      id: dbclient.kturi(orgid, t),
      organization_id: orgid,
      start: mt,
      end: t,
      resources: [],
      spaces: []
    };
  }

  debug('Found rated usage %o', doc.rows[0].doc);
  purgeOldQuantities(doc.rows[0].doc);

  const tokenAuth = systemToken && systemToken();
  return yield chargeUsage(t, yield summarizeUsage(t, 
    yield consumerUsage(doc.rows[0].doc), tokenAuth), tokenAuth);
};

// Return the usage for a list of orgs in a given time period
const orgsUsage = function *(orgids, time, auth) {
  const t = time || moment.now();
  return yield tmap(orgids, function *(orgid) {
    return yield orgUsage(orgid, t, auth);
  });
};

// Return the usage for a resource instance for a particular plan in a given
// organization, consumer, time period
const resourceInstanceUsage = function *(orgid, spaceid, resourceInstanceId,
  consumerId, planid, meteringPlanId, ratingPlanId, pricingPlanId,
  timeBasedKeySegment, time, auth) {
  // Forward authorization header field to account to authorize
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = yield brequest.get(
    uris.account + '/v1/organizations/:org_id/account/:time', extend(o, {
      org_id: orgid,
      time: time
    }));

  // Authorization failed. Unable to retrieve account information
  // for the given organization
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Throw response object as an exception to stop further processing
    throw res;
  }

  const id = ['k', orgid, resourceInstanceId, consumerId, planid,
    meteringPlanId, ratingPlanId, pricingPlanId,
    't', timeBasedKeySegment].join('/');

  const doc = yield accumulatordb.get(id);

  if(!doc) {
    debug('No resource instance usage found for %s on %s',
      resourceInstanceId, time);

    // Return an empty usage report if no usage was found
    return {};
  }

  // Adjust the windows to the requested time
  map(doc.accumulated_usage, (au) => {
    au.windows = adjustWindows(au.windows, doc.processed, time,
      findWindowLength());
  });

  debug('Found accumulated usage %o', doc);
  return yield chargeInstanceUsage(doc.processed,
    yield summarizeInstanceUsage(doc.processed, doc, auth), auth);
};

// Return the usage for an account in a given time period
const accountUsage = function *(accountid, time, auth) {
  const t = time || moment.now();

  // Forward authorization header field to account
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = yield brequest.get(
    uris.account + '/v1/accounts/:account_id', extend(o, {
      account_id: accountid
    }));

  // Validation failed. Unable to retrieve account information
  // for the given account id
  if (res.statusCode !== 200) {
    edebug('Unable to retrieve account information, %o', res);
    debug('Unable to retrieve account information, %o', res);

    // Throw response object as an exception to stop further processing
    throw res;
  }

  if(!account.body || !account.body.organizations)
    return undefined;
  return yield orgsUsage(account.body.organizations, t, auth);
};

// Define GraphQL query schema
const organizationType = schemas.organizationReport.graph();
const instanceType = schemas.resourceInstanceReport.graph();

const graphSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'query',
    fields: () => ({
      organization: {
        type: organizationType,
        args: {
          organization_id: {
            name: 'organization_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(orgUsage)(
              args.organization_id, args.time, args.authorization);
        }
      },
      organizations: {
        type: new GraphQLList(organizationType),
        args: {
          organization_ids: {
            name: 'organization_ids',
            type: new GraphQLList(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(orgsUsage)(
              args.organization_ids, args.time, args.authorization);
        }
      },
      account: {
        type: new GraphQLList(organizationType),
        args: {
          account_id: {
            name: 'account_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(accountUsage)(
            args.account_id, args.time, args.authorization);
        }
      },
      resource_instance: {
        type: instanceType,
        args: {
          organization_id: {
            name: 'organization_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          space_id: {
            name: 'space_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          consumer_id: {
            name: 'consumer_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          resource_instance_id: {
            name: 'resource_instance_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          plan_id: {
            name: 'plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          metering_plan_id: {
            name: 'metering_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          rating_plan_id: {
            name: 'rating_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          pricing_plan_id: {
            name: 'pricing_plan_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          t: {
            name: 't',
            type: GraphQLString
          },
          time: {
            name: 'time',
            type: GraphQLFloat
          },
          authorization: {
            name: 'authorization',
            type: GraphQLString
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(resourceInstanceUsage)(
            args.organization_id, args.space_id, args.resource_instance_id,
            args.consumer_id, args.plan_id, args.metering_plan_id,
            args.rating_plan_id, args.pricing_plan_id, args.t, args.time,
            args.authorization);
        }
      }
    })
  })
});

// Run a GraphQL query as a generator
const runQuery = function *(query) {
  // Convert the promise returned by graphql to a generator then yield it
  return yield yieldable(graphql(graphSchema, query));
};

// Return OAuth system scopes needed to retrieve org usage
const sysScopes = () => secured() ? {
  system: ['abacus.usage.read']
} : undefined;

// Return OAuth resource or system scopes needed to retrieve resource instance
// usage
const scopes = (resourceId) => secured() ? {
  resource: [['abacus.usage', resourceId, 'read'].join('.')],
  system: ['abacus.usage.read']
} : undefined;

// Retrieve a usage report summary for a given org and time in msec
const retrieveUsage = function *(req) {
  debug('Retrieving rated usage for organization %s on %s',
    req.params.organization_id, req.params.time);

  if (secured())
    oauth.authorize(req.headers && req.headers.authorization, sysScopes());

  // Retrieve and return the rated usage for the given org and time
  const doc = yield orgUsage(req.params.organization_id,
    req.params.time ? parseInt(req.params.time) : undefined,
    req.headers && req.headers.authorization);

  return {
    body: omit(dbclient.undbify(doc),
      ['last_rated_usage_id', 'aggregated_usage_id',
        'accumulated_usage_id', 'resource_instance_id',
        'consumer_id', 'resource_id', 'plan_id', 'pricing_country', 'prices'])
  };
};

// Retrieve a usage report summary for a resource instance given the
// org, space, resource instance, consumer, plan, metering plan,
// rating plan, pricing plan, t, time
const retrieveResourceInstanceUsage = function *(req) {
  debug('Retrieving rated usage for resource instance %s on %s',
    req.params.resource_instance_id, req.params.time);

  if (secured())
    oauth.authorize(req.headers && req.headers.authorization,
      scopes(req.params.resource_id));

  const doc = yield resourceInstanceUsage(req.params.organization_id,
    req.params.space_id, req.params.resource_instance_id,
    req.params.consumer_id, req.params.plan_id, req.params.metering_plan_id,
    req.params.rating_plan_id, req.params.pricing_plan_id, req.params.t,
    req.params.time ? parseInt(req.params.time) : undefined,
    req.headers && req.headers.authorization);

  return {
    body: omit(dbclient.undbify(doc),
      ['last_rated_usage_id', 'aggregated_usage_id', 'accumulated_usage_id'])
  };
};

// Create an express router
const routes = router();

// Retrieve a usage report summary for a given org and time in msec
routes.get(
  '/v1/metering/organizations/:organization_id/aggregated/usage/:time',
  throttle(retrieveUsage));

routes.get(
  '/v1/metering/organizations/:organization_id/aggregated/usage',
  throttle(retrieveUsage));

routes.get(
  '/v1/metering/organizations/:organization_id/spaces/:space_id/' +
  'resource_id/:resource_id/resource_instances/:resource_instance_id/' +
  'consumers/:consumer_id/plans/:plan_id/metering_plans/:metering_plan_id/' +
  'rating_plans/:rating_plan_id/pricing_plans/:pricing_plan_id/' +
  't/:t/aggregated/usage/:time',
  throttle(retrieveResourceInstanceUsage));

// Retrieve a usage summary using a GraphQL query
routes.get(
  '/v1/metering/aggregated/usage/graph/:query', throttle(function *(req) {
    debug(
      'Retrieving rated usage using graphql query %s', req.params.query);

    if (secured())
      oauth.authorize(req.headers && req.headers.authorization, sysScopes());

    const q = req.headers && req.headers.authorization ?
      req.params.query.replace(/(.*)\((.*)/,
      '$1(authorization: "' + req.headers.authorization + '", $2') :
      req.params.query;
    debug('Modified graphql query %s', q);

    // Run the given GraphQL query and return the result
    const doc = yield runQuery(q);
    debug('Graphql query result %o', doc);
    if(doc.errors) {
      edebug('Graphql query error %o', doc.errors);
      debug('Graphql query error %o', doc.errors);
      throw extend(
        new Error('Graphql query error - ' + doc.errors[0].message), {
          status: 400,
          error: 'query',
          reason: doc.errors[0].message,
          noretry: true,
          nobreaker: true
        });
    }

    return {
      body: omit(dbclient.undbify(doc.data),
        ['last_rated_usage_id', 'aggregated_usage_id', 'accumulated_usage_id',
          'resource_instances', 'resource_id', 'plan_id', 'pricing_country',
          'prices'])
    };
  }));

// Create a reporting service app
const reporting = () => {
  // Create the Webapp
  const app = webapp();

  // Secure organizations, metering and batch routes
  // using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));
  return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(uris.auth_server, process.env.CLIENT_ID,
      process.env.CLIENT_SECRET, 'abacus.usage.write abacus.usage.read');

    systemToken.start();
  }

  reporting().listen();
};

// Export our public functions
module.exports = reporting;
module.exports.runCLI = runCLI;
module.exports.consumerUsage = consumerUsage;
module.exports.summarizeUsage = summarizeUsage;
module.exports.chargeUsage = chargeUsage;
