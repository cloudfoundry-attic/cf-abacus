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
const find = _.find;

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

// Resolve service URIs
const uris = urienv({
  account: 9881,
  auth_server: 9882
});

// Configure rated usage db
const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage');
// Configure accumulated usage db
const accumulatordb = dataflow.db('abacus-accumulator-accumulated-usage');


// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () => /^[0-9]+[MDhms]$/.test(process.env.SLACK) ? {
  scale : process.env.SLACK.charAt(process.env.SLACK.length - 1),
  width : process.env.SLACK.match(/[0-9]+/)[0]
} : {
  scale : 'm',
  width : 10
};

// Returns first day of the month
const firstday = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

// Time dimensions
const dimensions = ['s', 'm', 'h', 'D', 'M'];

// Millisecond representation of the time dimensions
const msDimensions = {
  M: 2678400000,
  D: 86400000,
  h: 3600000,
  m: 60000,
  s: 1000
};

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
  else if(m && m.charge)
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
        const bounds = timewindow.timeWindowBounds(new Date(processed),
          dimensions[i], -j);
        // Return the charge, return null if it's undefined
        return s ? cfn ? extend({}, s, {
          charge: cfn(t, s.cost, bounds.from, bounds.to)
        }) : extend({}, s) : null;
      });
    })
  });
};

// Computes the charge for aggregated usage across plans
// Given the metric object and the equivalent plans object
const chargeAggregatedMetric = (metric, plans) => {
  // Filter the plan metrics to only include the current metric
  const planMetrics = map(plans, (p) => {
    return filter(p.aggregated_usage, (m) => m.metric === metric.metric)[0];
  });
  return extend({}, metric, {
    windows: map(metric.windows, (w, i) => {
      return map(w, (s, j) => {
        // Do not calculate the charge if the slack is null
        return s === null ? null : extend({}, s, {
          charge: reduce(planMetrics, (a, u) => {
            // Only add the plan usage window if it is defined
            if(u && u.windows[i][j] && u.windows[i][j] !== null)
              return a !== null ? a + u.windows[i][j].charge :
                u.windows[i][j].charge;
            return a;
          }, null)
        });
      });
    })
  });
};

// get rating plan
const getRatingPlan = function *(id, auth) {
  const rplan = yield rconfig(id, auth);

  // Error when getting rating plan
  if(rplan.error) {
    debug('Error when getting plan ' + id + '. ' +
      rplan.reason);

    throw extend({
      statusCode: 200
    }, rplan);
  };

  return rplan.rating_plan;
};

// get metering plan
const getMeteringPlan = function *(id, auth) {
  const mplan = yield mconfig(id, auth);

  // Error when getting rating plan
  if(mplan.error) {
    debug('Error when getting plan ' + id + '. ' +
      mplan.reason);

    throw extend({
      statusCode: 200
    }, mplan);
  };

  return mplan.metering_plan;
};

// Compute the charges for the given rated usage
const chargeUsage = function *(t, r, auth) {
  // Charge the rated usage under a resource
  const chargeResource = function *(rs) {
    // Compute the charge of each metric under the resource's plans
    const plans = yield tmap(rs.plans, function *(p) {
      // Find the metrics configured for the given resource
      const rplan = yield getRatingPlan(
        p.rating_plan_id, systemToken && systemToken());

      // Calculate the charges for all the metrics under a plan
      const cu = map(p.aggregated_usage, (m) => {
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
        })),
          (zu) => {
            return map(unzip(zu), (uu) => {
              return reduce(uu, sumCharges, null);
            });
          }
        )
      });
    });

    // Return the resource's plans including the calculated charges and the
    // aggregated charge for the resource
    return extend({}, rs, {
      aggregated_usage: map(rs.aggregated_usage, (au) => {
        return chargeAggregatedMetric(au, plans);
      }),
      plans: plans,
      windows: map(zip.apply(_, map(plans, (p) => {
        return p.windows;
      })),
        (zu) => {
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

const chargeInstanceUsage = function *(t, a, auth) {
  // Find the metrics configured for the given resource
  const rplan = yield getRatingPlan(
    a.rating_plan_id, systemToken && systemToken());
  const c = extend({}, a, {
    accumulated_usage: map(a.accumulated_usage, (m) => {
      return chargePlanMetric(t, m, a.processed,
        chargefn(rplan.metrics, m.metric));
    })
  });
  c.windows = map(zip.apply(_, map(c.accumulated_usage, (au) => au.windows)),
    (z) => map(unzip(z), (u) => reduce(u, sumCharges, null)));
  debug('Charged usage %o', c);
  return c;
};

// Summarize a metric
const summarizeMetric = (m, t, processed, sfn) => {
  // Clone the metric and extend with a usae summary
  return extend({}, m, {
    windows: map(m.windows, (w, i) => {
      return map(w, (wi, j) => {
        const bounds = timewindow.timeWindowBounds(new Date(processed),
          dimensions[i], -j);
        return wi ? sfn ? extend({}, wi, {
          summary: sfn(t, wi.quantity, bounds.from, bounds.to)
        }) : extend({}, wi) : null;
      });
    })
  });
};

// Compute usage summaries for the given aggregated usage
const summarizeUsage = function *(t, a, auth) {
  // Summarize the aggregated usage under a resource
  const summarizeResource = function *(rs) {
    // Clone the resource and extend it with usage summaries
    return extend({}, rs, {
      aggregated_usage: map(rs.aggregated_usage, (m) => {
        return summarizeMetric(m, t, a.processed);
      }),
      plans: yield tmap(rs.plans, function *(p) {
        // Find the metrics configured for the given metering plan
        const mplan = yield getMeteringPlan(p.metering_plan_id,
          systemToken && systemToken());

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
  const mplan = yield getMeteringPlan(a.metering_plan_id,
    systemToken && systemToken());
  const s = extend({}, a, {
    accumulated_usage: map(a.accumulated_usage, (m) => {
      setCurrentQuantity(m.windows);
      return summarizeMetric(m, t, a.processed,
        summarizefn(mplan.metrics, m.metric));
    })
  });
  debug('Summarized usage %o', s);
  return s;
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

  debug('Ids %o', ids);

  debug('Retrieving consumer usage for organization %o', u.organization_id);
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
          // Shift all the windows
          map(consumer.resources, (resource) => {
            map(resource.aggregated_usage, (au) => {
              map(au.windows, (w, i) => {
                timewindow.shiftWindow(new Date(consumer.processed),
                  new Date(u.processed), w, dimensions[i]);
              });
            });
            map(resource.plans, (plan) => {
              delete plan.resource_instances;
              map(plan.aggregated_usage, (au) => {
                map(au.windows, (w, i) => {
                  timewindow.shiftWindow(new Date(consumer.processed),
                    new Date(u.processed), w, dimensions[i]);
                });
              });
            });
          });
          return omit(consumer,
            ['_id', 'id', '_rev', 'accumulated_usage_id',
            'processed', 'processed_id', 'resource_instance_id', 'start',
            'end', 'organization_id']);
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
  const t = time || Date.now();
  const d = new Date(t);
  const mt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
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
  return yield chargeUsage(t,
    yield summarizeUsage(t, yield consumerUsage(doc.rows[0].doc), auth), auth);
};

// Return the usage for a list of orgs in a given time period
const orgsUsage = function *(orgids, time, auth) {
  const t = time || Date.now();
  return yield tmap(orgids, function *(orgid) {
    return yield orgUsage(orgid, t, auth);
  });
};

// Return the usage for a resource instance for a particular plan in a given
// organization, consumer, time period
const resourceInstanceUsage = function *(orgid, spaceid, resid, conid, planid,
  mplanid, rplanid, pplanid, time, auth) {
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
  const t = time || Date.now();
  const slackLimit = msDimensions[slack().scale] * slack().width;
  const mt = firstday(firstday(t) - slackLimit);
  const sid = dbclient.kturi([orgid, spaceid, conid].join('/'), seqid.pad16(t))
    + '~';
  const eid = dbclient.kturi([orgid, spaceid, conid].join('/'),
    seqid.pad16(mt));

  debug('Retrieving latest consumer usage between %s and %s', eid, sid);
  const consumer = yield aggregatordb.allDocs({
    endkey: eid,
    startkey: sid,
    descending: true,
    limit: 1,
    include_docs: true
  });

  if(!consumer.rows.length) {
    debug('No existing consumer aggregated usage');

    // Return an empty usage report if no usage was found
    return {};
  }

  const plankey = [planid, mplanid, rplanid, pplanid].join('/');
  let id = '';
  debug('Looking for resource instance %s with plan %s', resid, plankey);
  find(consumer.rows[0].doc.resources, (r) => {
    return find(r.plans, (p) => {
      return p.plan_id === plankey ? find(p.resource_instances, (ri) => {
        if(ri.id === resid) {
          id = ['k', orgid, resid, conid, planid, mplanid, rplanid,
          pplanid, 't', ri.t].join('/');
          return id;
        }
        return false;
      }) : false;
    });
  });

  if(!id) {
    debug('Resource instance %s not found for organization %s', resid, orgid);
    return {};
  }

  const doc = yield accumulatordb.get(id);

  debug('Found accumulated usage %o', doc);
  return yield chargeInstanceUsage(t,
    yield summarizeInstanceUsage(t, doc, auth), auth);
};

// Return the usage for an account in a given time period
const accountUsage = function *(accountid, time, auth) {
  const t = time || Date.now();

  // Forward authorization header field to account
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = yield brequest.get(
    uris.account + '/v1/organizations/:org_id/account/:time', extend(o, {
      account_id: accountid,
      time: time
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
            args.rating_plan_id, args.pricing_plan_id, args.time,
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

// Retrieve a usage report summary for a given org and time in msec
const retrieveUsage = function *(req) {
  debug('Retrieving rated usage for organization %s on %s',
    req.params.organization_id, req.params.time);

  // Retrieve and return the rated usage for the given org and time
  const doc = yield orgUsage(req.params.organization_id,
    req.params.time ? parseInt(req.params.time) : undefined,
    req.headers && req.headers.authorization);

  return {
    body: omit(dbclient.undbify(doc),
      ['last_rated_usage_id', 'aggregated_usage_id',
      'accumulated_usage_id', 'resource_instance_id',
      'consumer_id'])
  };
};

// Retrieve a usage report summary for a resource instance given the
// org, resource instance, consumer, plan, metering plan,
// rating plan, pricing plan, time
const retrieveResourceInstanceUsage = function *(req) {
  debug('Retrieving rated usage for resource instance %s on %s',
    req.params.resource_instance_id, req.params.time);

  const doc = yield resourceInstanceUsage(req.params.organization_id,
    req.params.space_id, req.params.resource_instance_id,
    req.params.consumer_id, req.params.plan_id, req.params.metering_plan_id,
    req.params.rating_plan_id, req.params.pricing_plan_id,
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
  'resource_instances/:resource_instance_id/consumers/:consumer_id/plans/' +
  ':plan_id/metering_plans/:metering_plan_id/rating_plans/:rating_plan_id/' +
  'pricing_plans/:pricing_plan_id/aggregated/usage/:time',
  throttle(retrieveResourceInstanceUsage));

routes.get(
  '/v1/metering/organizations/:organization_id/spaces/:space_id/' +
  'resource_instances/:resource_instance_id/consumers/:consumer_id/plans/' +
  ':plan_id/metering_plans/:metering_plan_id/rating_plans/:rating_plan_id/' +
  'pricing_plans/:pricing_plan_id/aggregated/usage',
  throttle(retrieveResourceInstanceUsage));

// Retrieve a usage summary using a GraphQL query
routes.get(
  '/v1/metering/aggregated/usage/graph/:query', throttle(function *(req) {
    debug(
      'Retrieving rated usage using graphql query %s', req.params.query);

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
        ['last_rated_usage_id', 'aggregated_usage_id',
        'accumulated_usage_id', 'resource_instances'])
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
