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
const config = require('abacus-resource-config');
const schema = require('abacus-schema');
const oauth = require('abacus-cfoauth');

const omit = _.omit;
const map = _.map;
const extend = _.extend;
const filter = _.filter;
const reduce = _.reduce;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

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
  retry(breaker(batch(db.logdb(uris.couchdb, 'abacus-rated-usage')))));

// Return the aggregation start time for a given time
const day = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the charge function for a given metric
const chargefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].chargefn;
};

// Return the summarize function for a given metric
const summarizefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].summarizefn;
};

// Reduce function that can be used to compute the sum of a list of charges
const sumCharges = (a, m) => a + m.charge;

// Compute the charges for the given rated usage
const chargeUsage = (t, r) => {
  // Charge the rated usage under a resource
  const chargeResource = (rs) => {

    // Find the metrics configured for the given resource
    const metrics = config(rs.resource_id).metrics;

    // Compute the charge of each metric under the resource's plans
    const plans = map(rs.plans, (p) => {
      // Calculate the charges for all the metrics under a plan
      const cu = map(p.aggregated_usage, (m) => {
        // Find the charge function configured for each metric
        const cfn = chargefn(metrics, m.metric);

        // Clone the metric and return it along with the calculated charge
        return extend({}, m, {
          charge: cfn(t, m.cost)
        });
      });

      // Return the metrics including the calculated charges and the
      // aggregated charge for the plan
      return extend({}, p, {
        aggregated_usage: cu,
        charge: reduce(cu, sumCharges, 0)
      });
    });

    // Calculate the charge for a metric across the resource's plans
    const chargeMetric = (metric) => {
      return extend({}, metric, {
        charge: reduce(plans, (a, p) => a +
          reduce(filter(p.aggregated_usage, (m) => m.metric === metric.metric),
            sumCharges, 0), 0)
      });
    };

    // Return the resource's plans including the calculated charges and the
    // aggregated charge for the resource
    return extend({}, rs, {
      charge: reduce(plans, sumCharges, 0),
      aggregated_usage: map(rs.aggregated_usage, chargeMetric),
      plans: plans
    });
  };

  // Clone the rated usage and extend if with the computed charges
  const cr = map(r.resources, chargeResource);
  const c = extend({}, r, {
    charge: reduce(cr, sumCharges, 0),
    resources: cr,
    spaces: map(r.spaces, (space) => {
      const cr = map(space.resources, chargeResource);
      return extend({}, space, {
        charge: reduce(cr, sumCharges, 0),
        resources: cr,
        consumers: map(space.consumers, (consumer) => {
          const cr = map(consumer.resources, chargeResource);
          return extend({}, consumer, {
            charge: reduce(cr, sumCharges, 0),
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
const summarizeUsage = (t, a) => {
  // Summarize the aggregated usage under a resource
  const summarizeResource = (rs) => {
    // Find the metrics configured for the given resource
    const metrics = config(rs.resource_id).metrics;

    // Summarize a metric
    const summarizeMetric = (m) => {
      // Find the summary function configured for the metric
      const sfn = summarizefn(metrics, m.metric);

      // Clone the metric and extend with a usae summary
      return extend({}, m, {
        summary: sfn(t, m.quantity)
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
    resources: map(a.resources, summarizeResource),
    spaces: map(a.spaces, (space) => {
      return extend({}, space, {
        resources: map(space.resources, summarizeResource),
        consumers: map(space.consumers, (consumer) => {
          return extend({}, consumer, {
            resources: map(consumer.resources, summarizeResource)
          });
        })
      });
    })
  });
  debug('Summarized usage %o', s);
  return s;
};

// Return the usage for an org in a given time period
const orgUsage = function *(orgid, time) {
  const t = time || Date.now();
  const id = dbclient.kturi(orgid, day(t));
  debug('Retrieving rated usage for %s', id);
  const doc = yield ratedb.get(id);
  if(!doc) {
    debug('No existing rated usage');
    return undefined;
  }

  debug('Found rated usage %o', doc);
  return chargeUsage(t, summarizeUsage(t, doc));
};

// Return the usage for a list of orgs in a given time period
const orgsUsage = function *(orgids, time) {
  const t = time || Date.now();
  return yield tmap(orgids, function *(orgid) {
    return yield orgUsage(orgid, t);
  });
};

// Return the usage for an account in a given time period
const accountUsage = function *(authorization, accountid, time) {
  const t = time || Date.now();

  // Forward authorization header field to account
  const o = authorization ? {
    headers: {
      authorization: authorization
    }
  } : {};

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
          authorization: {
            name: 'authorization',
            type: GraphQLString
          },
          organization_id: {
            name: 'organization_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLInt
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(orgUsage)(
              args.organization_id, args.time);
        }
      },
      organizations: {
        type: new GraphQLList(organizationType),
        args: {
          authorization: {
            name: 'authorization',
            type: GraphQLString
          },
          organization_ids: {
            name: 'organization_ids',
            type: new GraphQLList(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLInt
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(orgsUsage)(
              args.organization_ids, args.time);
        }
      },
      account: {
        type: new GraphQLList(organizationType),
        args: {
          authorization: {
            name: 'authorization',
            type: GraphQLString
          },
          account_id: {
            name: 'account_id',
            type: new GraphQLNonNull(GraphQLString)
          },
          time: {
            name: 'time',
            type: GraphQLInt
          }
        },
        resolve: (root, args) => {
          return yieldable.promise(accountUsage)(
              args.authorization, args.account_id, args.time);
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
  const r = yield orgUsage(req.params.organization_id,
    req.params.time ? parseInt(req.params.time) : undefined);

  const doc = r ? r : {
    id: req.params.organization_id,
    resources: [],
    spaces: []
  };
  return {
    body: omit(dbclient.undbify(doc),
      ['last_rated_usage_id', 'aggregated_usage_id',
      'accumulated_usage_id'])
  };
};

// Create an express router
const routes = router();

// Retrieve a usage report summary for a given org and time in msec
routes.get(
  '/v1/organizations/:organization_id/usage/:time', throttle(retrieveUsage));
routes.get(
  '/v1/organizations/:organization_id/usage', throttle(retrieveUsage));

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

// Create a reporting app
const reporting = () => {
  const app = webapp();

  // Secure organizations, metering and batch routes
  // using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/organizations|^\/v1\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => reporting().listen();

// Export our public functions
module.exports = reporting;
module.exports.runCLI = runCLI;
