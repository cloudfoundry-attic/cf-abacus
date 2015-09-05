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

const omit = _.omit;
const map = _.map;
const extend = _.extend;
const clone = _.clone;
const filter = _.filter;
const reduce = _.reduce;

const tmap = yieldable(transform.map);

const get = yieldable(retry(breaker(request.get)));

const graphql = schema.graphql.graphql;
const GraphQLSchema = schema.graphql.GraphQLSchema;
const GraphQLObjectType = schema.graphql.GraphQLObjectType;
const GraphQLNonNull = schema.graphql.GraphQLNonNull;
const GraphQLString = schema.graphql.GraphQLString;
const GraphQLList = schema.graphql.GraphQLList;

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  account: 9381
});

// Configure rated usage db
const ratedb = yieldable(
  retry(breaker(batch(db(uris.couchdb, 'abacus-rated-usage')))));

// Return the aggregation start time for a given time
const day = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the charge function for a given metric
const chargefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].chargefn;
};

// Reduce function that can be used to compute the sum of a list of charges
const sumCharges = (a, m) => a + m.charge;

// Compute the charges for the given rated usage
const chargeUsage = (r, t) => {
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
        return extend(clone(m), {
          charge: cfn(t, m.cost)
        });
      });

      // Return the metrics including the calculated charges and the
      // aggregated charge for the plan
      return extend(clone(p), {
        aggregated_usage: cu,
        charge: reduce(cu, sumCharges, 0)
      });
    });

    // Calculate the charge for a metric across the resource's plans
    const chargeMetric = (metric) => {
      return extend(clone(metric), {
        charge: reduce(plans, (a, p) => a +
          reduce(filter(p.aggregated_usage, (m) => m.metric === metric.metric),
            sumCharges, 0), 0)
      });
    };

    // Return the resource's plans including the calculated charges and the
    // aggregated charge for the resource
    return extend(clone(rs), {
      charge: reduce(plans, sumCharges, 0),
      aggregated_usage: map(rs.aggregated_usage, chargeMetric),
      plans: plans
    });
  };

  // Clone the rated usage and extend if with the computed charges
  const cr = map(r.resources, chargeResource);
  const c = extend(clone(r), {
    charge: reduce(cr, sumCharges, 0),
    resources: cr,
    spaces: map(r.spaces, (space) => {
      const cr = map(space.resources, chargeResource);
      return extend(clone(space), {
        charge: reduce(cr, sumCharges, 0),
        resources: cr,
        consumers: map(space.consumers, (consumer) => {
          const cr = map(consumer.resources, chargeResource);
          return extend(clone(consumer), {
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

// Return the usage for an org in a given time period
const orgUsage = function *(orgid, time) {
  const t = Date.parse(time);
  const id = dbclient.kturi(orgid, day(t));
  debug('Retrieving rated usage for %s', id);
  const doc = yield ratedb.get(id);
  if(!doc) {
    debug('No existing rated usage');
    return undefined;
  }

  debug('Found rated usage %o', doc);
  return chargeUsage(doc, t);
};

// Return the usage for a list of orgs in a given time period
const orgsUsage = function *(orgids, time) {
  return yield tmap(orgids, function *(orgid) {
      return yield orgUsage(orgid, time);
    });
};

// Return the usage for an account in a given time period
const accountUsage = function *(accountid, time) {
  const account = yield get(uris.account + '/v1/accounts/:account_id', {
    account_id: accountid
  });
  if(!account.body || !account.body.organizations)
    return undefined;
  return yield orgsUsage(account.body.organizations, time);
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
            date: {
              name: 'date',
              type: new GraphQLNonNull(GraphQLString)
            }
          },
          resolve: (root, args) => {
            return yieldable.promise(orgUsage)(
              args.organization_id, args.date);
          }
        },
        organizations: {
          type: new GraphQLList(organizationType),
          args: {
            organization_ids: {
              name: 'organization_ids',
              type: new GraphQLList(GraphQLString)
            },
            date: {
              name: 'date',
              type: new GraphQLNonNull(GraphQLString)
            }
          },
          resolve: (root, args) => {
            return yieldable.promise(orgsUsage)(
              args.organization_ids, args.date);
          }
        },
        account: {
          type: new GraphQLList(organizationType),
          args: {
            account_id: {
              name: 'account_id',
              type: new GraphQLNonNull(GraphQLString)
            },
            date: {
              name: 'date',
              type: new GraphQLNonNull(GraphQLString)
            }
          },
          resolve: (root, args) => {
            return yieldable.promise(accountUsage)(
              args.account_id, args.date);
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

// Create an express router
const routes = router();

// Retrieve rated usage for a given org and day
routes.get(
  '/v1/organizations/:organization_id/usage/:day', throttle(function *(req) {
    debug('Retrieving rated usage for organization %s on %s', req.params
      .organization_id, req.params.day);

    // Retrieve and return the rated usage for the given org and time
    const r = yield orgUsage(req.params.organization_id, req.params.day);
    const doc = r ? r : {
      id: req.params.organization_id,
      resources: [],
      spaces: []
    };
    return {
      body: omit(doc,
        '_id', '_rev', 'last_rated_usage_id', 'aggregated_usage_id',
        'accumulated_usage_id')
    };
  }));

// Retrieve rated usage using a GraphQL query
routes.get(
  '/v1/metering/aggregated/usage/graph/:query', throttle(function *(req) {
    debug(
      'Retrieving rated usage using graphql query %s', req.params.query);

    // Run the given GraphQL query and return the result
    const doc = yield runQuery(req.params.query);
    debug('Graphql query result %o', doc);

    return {
      body: omit(doc.data,
        '_id', '_rev', 'last_rated_usage_id', 'aggregated_usage_id',
        'accumulated_usage_id')
    };
  }));

// Create a reporting app
const reporting = () => {
  const app = webapp();
  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => reporting().listen();

// Export our public functions
module.exports = reporting;
module.exports.runCLI = runCLI;

