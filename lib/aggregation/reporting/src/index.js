'use strict';

// Rated usage reporting service.

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
const db = require('abacus-aggregation-db');
const schemas = require('abacus-usage-schemas');
const configcb = require('abacus-resource-config');
const schema = require('abacus-schema');
const oauth = require('abacus-cfoauth');

const omit = _.omit;
const map = _.map;
const extend = _.extend;
const filter = _.filter;
const reduce = _.reduce;
const zip = _.zip;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

const config = yieldable(configcb);

const graphql = schema.graphql.graphql;
const GraphQLSchema = schema.graphql.GraphQLSchema;
const GraphQLObjectType = schema.graphql.GraphQLObjectType;
const GraphQLNonNull = schema.graphql.GraphQLNonNull;
const GraphQLString = schema.graphql.GraphQLString;
const GraphQLInt = schema.graphql.GraphQLInt;
const GraphQLList = schema.graphql.GraphQLList;

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  account: 9381
});

// Configure rated usage db
const ratedb = yieldable(
  retry(breaker(batch(db.logdb(uris.couchdb, 'abacus-rated-usage-log')))));

// Return the charge function for a given metric
const chargefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].chargefn;
};

// Return the summarize function for a given metric
const summarizefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].summarizefn;
};

// Reduce function that can be used to compute the sum of a list of charges
const sumCharges = (a, m) => {
  a.charge += m.charge ? m.charge : 0;
  return a;
};

// Compute the charges for the given rated usage
const chargeUsage = function *(t, r, auth) {
  // Charge the rated usage under a resource
  const chargeResource = function *(rs) {

    // Find the metrics configured for the given resource
    const conf = yield config(rs.resource_id, r.end, auth);

    // Compute the charge of each metric under the resource's plans
    const plans = map(rs.plans, (p) => {
      // Calculate the charges for all the metrics under a plan
      const cu = map(p.aggregated_usage, (m) => {
        // Find the charge function configured for each metric
        const cfn = chargefn(conf.metrics, m.metric);

        // Clone the metric and return it along with the calculated charge
        return extend({}, m, {
          windows: map(m.windows, (w) => {
            return extend({}, w, {
              charge: cfn(t, w.cost)
            });
          })
        });
      });

      // Return the metrics including the calculated charges and the
      // aggregated charge for the plan
      return extend({}, p, {
        aggregated_usage: cu,
        windows: map(zip.apply(_, map(cu, (u) => {
          return u.windows
        })),
          (zu) => {
            return reduce(zu, sumCharges, { charge: 0 });
          }
        )
      });
    });

    // Calculate the charge for a metric across the resource's plans
    const chargeMetric = (metric) => {
      return extend({}, metric, {
        windows: map(metric.windows, (w, i) => {
          return extend({}, w, {
            charge: reduce(plans, (a, p) => a +
              reduce(filter(p.aggregated_usage,
                (m) => m.metric === metric.metric), (a, m) =>
                  a + m.windows[i].charge, 0), 0)
          });
        })
      });
    };

    // Return the resource's plans including the calculated charges and the
    // aggregated charge for the resource
    return extend({}, rs, {
      aggregated_usage: map(rs.aggregated_usage, chargeMetric),
      plans: plans,
      windows: map(zip.apply(_, map(plans, (p) => {
        return p.windows
      })),
        (zu) => {
          return reduce(zu, sumCharges, { charge: 0 });
        })
    });
  };

  // Clone the rated usage and extend if with the computed charges
  const cr = yield tmap(r.resources, chargeResource);
  const c = extend({}, r, {
    windows: map(zip.apply(_, map(cr, (rs) => {
      return rs.windows
    })), (zr) => {
      return reduce(zr, sumCharges, { charge: 0 });
    }),
    resources: cr,
    spaces: yield tmap(r.spaces, function *(space) {
      const cr = yield tmap(space.resources, chargeResource);
      return extend({}, space, {
        windows: map(zip.apply(_, map(cr, (rs) => {
          return rs.windows
        })), (zr) => {
          return reduce(zr, sumCharges, { charge: 0 });
        }),
        resources: cr,
        consumers: yield tmap(space.consumers, function *(consumer) {
          const cr = yield tmap(consumer.resources, chargeResource);
          return extend({}, consumer, {
            windows: map(zip.apply(_, map(cr, (rs) => {
              return rs.windows
            })), (zr) => {
              return reduce(zr, sumCharges, { charge: 0 });
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

// Compute usage summaries for the given aggregated usage
const summarizeUsage = function *(t, a, auth) {
  // Summarize the aggregated usage under a resource
  const summarizeResource = function *(rs) {

    // Find the metrics configured for the given resource
    const conf = yield config(rs.resource_id, a.end, auth);

    // Summarize a metric
    const summarizeMetric = (m) => {
      // Find the summary function configured for the metric
      const sfn = summarizefn(conf.metrics, m.metric);

      // Clone the metric and extend with a usae summary
      return extend({}, m, {
        windows: map(m.windows, (w) => {
          return extend({}, w, {
            summary: sfn(t, w.quantity)
          });
        })
      });
    };

    // Clone the resource and extend it with usage summaries
    return extend({}, rs, {
      aggregated_usage: map(rs.aggregated_usage, summarizeMetric),
      plans: map(rs.plans, (p) => {
        return extend({}, p, {
          aggregated_usage: map(p.aggregated_usage, summarizeMetric)
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

// Return the usage for an org in a given time period
const orgUsage = function *(orgid, time, auth) {
  // Compute the query range
  const t = time || Date.now();
  const d = new Date(t);
  const mt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const sid = dbclient.kturi(orgid, t + 1);
  const eid = dbclient.kturi(orgid, mt);

  debug('Retrieving latest rated usage between %s and %s', eid, sid);
  const doc = yield ratedb.allDocs({ endkey: eid, startkey: sid,
    descending: true, limit: 1, include_docs: true });
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
    yield summarizeUsage(t, doc.rows[0].doc, auth), auth);
};

// Return the usage for a list of orgs in a given time period
const orgsUsage = function *(orgids, time, auth) {
  const t = time || Date.now();
  return yield tmap(orgids, function *(orgid) {
    return yield orgUsage(orgid, t, auth);
  });
};

// Return the usage for an account in a given time period
const accountUsage = function *(accountid, time, auth) {
  const t = time || Date.now();

  // Forward authorization header field to account
  const o = auth ? { headers: { authorization: auth } } : {};

  const account = yield brequest.get(
    uris.account + '/v1/accounts/:account_id', extend(o, {
      account_id: accountid
    }));
  if(!account.body || !account.body.organizations)
    return undefined;
  return yield orgsUsage(account.body.organizations, t);
};

// Define GraphQL query schema
const organizationType = schemas.organizationReport.graph();

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
            type: GraphQLInt
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
            type: GraphQLInt
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
            type: GraphQLInt
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

  const auth = req.headers && req.headers.authorization ?
    req.headers.authorization : undefined;

  // Retrieve and return the rated usage for the given org and time
  const doc = yield orgUsage(req.params.organization_id,
    req.params.time ? parseInt(req.params.time) : undefined, auth);

  return {
    body: omit(dbclient.undbify(doc),
      ['last_rated_usage_id', 'aggregated_usage_id',
      'accumulated_usage_id'])
  };
};

// Configure acculuate usage log db
const accumulogdb = yieldable(retry(breaker(batch(
  db.logdb(uris.couchdb, 'abacus-accumulated-usage-log')))));

// [Second, Minute, Hour, Day, Month, Year]
const timescale = [1, 100, 10000, 1000000, 100000000, 10000000000];

// Enumerations for time window names
const timewindow = {
  'YEAR' : 5,
  'MONTH' : 4,
  'DAY': 3,
  'HOUR': 2,
  'MINUTE': 1,
  'SECOND': 0
};


// Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
const dateUTCNumbify = function(t) {
  const d = new Date(t);
  return d.getUTCFullYear() * timescale[5] + d.getUTCMonth() * timescale[4] +
    d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2] +
    d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
};

// Converts a number output in dateUTCNumbify back to a Date object
const revertUTCNumber = function(n) {
  const numstring = n.toString();
  const d = new Date(Date.UTC(
    numstring.substring(0, 4),
    numstring.substring(4, 6),
    numstring.substring(6, 8),
    numstring.substring(8, 10),
    numstring.substring(10, 12),
    numstring.substring(12)
  ));
  return d;
};

// Converts time in ms to the starting time of the window
const windowStartTime = function(time, window) {
  const d = new Date(time);
  const sDate = new Date(revertUTCNumber(
    Math.floor(dateUTCNumbify(d) / timescale[window]) * timescale[window]));
  if(window > timewindow.DAY)
    sDate.setUTCDate(sDate.getUTCDate() + 1);
  return sDate.getTime();
};

// Converts time in ms to the closing time of the window
const windowEndTime = function(time, window) {
  const d = new Date(time);
  const eDate = new Date(revertUTCNumber(
    Math.floor(dateUTCNumbify(d) / timescale[window] + 1) *
    timescale[window]));
  if(window > timewindow.DAY)
    eDate.setUTCDate(eDate.getUTCDate() + 1);
  eDate.setUTCMilliseconds(-1);
  return eDate.getTime();
};

// Retrieve accumulated usage for a resource instance
// in an org at a point in time for a time window
// time defaults to Date.now()
// window defaults to MONTH
const instanceUsage = function *(instanceId, plan, orgId, time, window) {
  const t = time || Date.now();
  const w = timewindow[window] ? window : 'MONTH';
  debug('Retrieving rated usage for resource instance %s with plan %s ' +
  'in organization %s on %s for time window %s', instanceId, plan, orgId, t, w);
  const endkey = dbclient.kturi(orgId + '/' + instanceId +
    '/' + plan, windowStartTime(t, timewindow[w]));
  const startkey = dbclient.kturi(orgId + '/' + instanceId +
   '/' + plan , windowEndTime(t, timewindow[w])) + 'z';
  const options = {
    include_docs: true,
    startkey: startkey,
    endkey: endkey,
    inclusive_end: false,
    limit: 2,
    descending: true
  };
  let doc = yield accumulogdb.allDocs(options);
  // When the result set is sorted in the descending order, the doc with
  // accumulated usage across multiple time window appears second
  if(doc.rows.length === 2 && doc.rows[1].doc.accumulated_usage) {
    debug('Found rated usage %o', doc);
    doc = doc.rows[1].doc;
    doc.accumulated_usage = doc.accumulated_usage.map(function(usage) {
      usage.quantity = usage.quantity[timewindow[w]].current;
      return usage;
    });
  }
  else {
    debug('No existing accumulated usage');
    doc = null;
  }
  return doc;
};

// Retrieve accumulated usage for a resource instance
// in an org at a point in time for a time window
const retrieveInstanceUsage = function *(req) {
  debug('Retrieving rated usage for resource instance %s with plan %s ' +
  'in organization %s on %s for time window %s',
  req.params.resource_instance_id, req.params.plan, req.params.organization_id,
  req.params.time, req.query.window);

  const r = yield instanceUsage(req.params.resource_instance_id,
    req.params.plan, req.params.organization_id,
    req.params.time ? parseInt(req.params.time) : undefined,
    req.query.window ? req.query.window : undefined);

  const doc = r ? r : {
    resource_instance_id: req.params.resource_instance_id,
    plan_id : req.params.plan,
    organization_id: req.params.organization_id,
    accumulated_usage: []
  };
  return {
    body: omit(dbclient.undbify(doc),
      ['normalized_usage_id', 'collected_usage_id',
      'processed_usage_id', 'id'])
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

// Retrieve a usage summary using a GraphQL query
routes.get(
  '/v1/metering/aggregated/usage/graph/:query', throttle(function *(req) {
    debug(
      'Retrieving rated usage using graphql query %s', req.params.query);

    const q = req.headers.authroization ? req.params.query.replace(
      /(.*)\((.*)/,
      '$1(authorization:' + req.headers.authroization + ', $2') :
      req.params.query;
    debug('Modified graphql query %s', q)

    // Run the given GraphQL query and return the result
    const doc = yield runQuery(q);
    debug('Graphql query result %o', doc);

    return {
      body: omit(dbclient.undbify(doc.data),
        ['last_rated_usage_id', 'aggregated_usage_id',
        'accumulated_usage_id'])
    };
  }));

// Retrieve accumulated usage for a source instance in an
// organization at a point in time
routes.get(
  '/v1/metering/organizations/:organization_id' +
  '/resources/:resource_instance_id/:plan/usage/:time',
  throttle(retrieveInstanceUsage));
routes.get(
  '/v1/metering/organizations/:organization_id' +
  '/resources/:resource_instance_id/:plan/usage',
  throttle(retrieveInstanceUsage));


// Create a reporting app
const reporting = () => {
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
const runCLI = () => reporting().listen();

// Export our public functions
module.exports = reporting;
module.exports.runCLI = runCLI;
