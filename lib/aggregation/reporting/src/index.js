'use strict';

// Aggregated usage reporting service.

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
const _g = require('graphql');

const omit = _.omit;

const tmap = yieldable(transform.map);

const get = yieldable(retry(breaker(request.get)));

const graphql = _g.graphql;
const GraphQLObjectType = _g.GraphQLObjectType;
const GraphQLNonNull = _g.GraphQLNonNull;
const GraphQLString = _g.GraphQLString;
const GraphQLFloat = _g.GraphQLFloat;
const GraphQLList = _g.GraphQLList;
const GraphQLSchema = _g.GraphQLSchema;

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-reporting');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  account: 9381
});

// Configure aggregated usage db
const ratedb = yieldable(
  retry(breaker(batch(db(uris.couchdb, 'abacus-rated-usage')))));

// Return the aggregation start time for a given time
const day = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the aggregated usage for an org in a given time period
const orgUsage = function *(orgid, time) {
  const id = dbclient.kturi(orgid, day(Date.parse(time)));
  debug('Retrieving rated aggregated usage for %s', id);
  const doc = yield ratedb.get(id);
  if(doc)
    debug('Found rated aggregated usage %o', doc);
  else
    debug('No existing rated aggregated usage');
  return doc;
};

// Return the aggregated usage for a list of orgs in a given time period
const orgsUsage = function *(orgids, time) {
  return yield tmap(orgids, function *(orgid) {
      return yield orgUsage(orgid, time);
    });
};

// Return the aggregated usage for an account in a given time period
const accountUsage = function *(accountid, time) {
  const account = yield get(uris.account + '/v1/accounts/:account_id', {
    account_id: accountid
  });
  if(!account.body || !account.body.organizations)
    return undefined;
  return yield orgsUsage(account.body.organizations, time);
};

// GraphQL schema for aggregated usage
const metricType = new GraphQLObjectType({
  name: 'Metric',
  description: 'A usage metric.',
  fields: () => ({
      unit: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'The unit used to meter usage.'
      },
      quantity: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The usage quantity.'
      },
      cost: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The usage cost to the metric.'
      }
  })
});

const planType = new GraphQLObjectType({
  name: 'Plan',
  description: 'A resource plan',
  fields: () => ({
      id: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'The id of the plan.'
      },
      aggregated_usage: {
        type: new GraphQLList(metricType),
        description: 'The list of usage metrics to the plan.'
      },
      cost: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The usage cost to the plan.'
      }
  })
});

const resourceType = new GraphQLObjectType({
  name: 'Resource',
  description: 'A metered resource.',
  fields: () => ({
      id: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'The id of the resource.'
      },
      aggregated_usage: {
        type: new GraphQLList(metricType),
        description: 'The list of usage metrics.'
      },
      plans: {
        type: new GraphQLList(planType),
        description: 'The list of resource plans.'
      },
      cost: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The usage cost to the resource.'
      }
  })
});

const consumerType = new GraphQLObjectType({
  name: 'Consumer',
  description: 'A consumer.',
  fields: () => ({
      id: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'The id of the consumer.'
      },
      resources: {
        type: new GraphQLList(resourceType),
        description: 'The list of metered resources.'
      },
      cost: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The usage cost to the consumer.'
      }
  })
});

const spaceType = new GraphQLObjectType({
  name: 'Space',
  description: 'A space.',
  fields: () => ({
      id: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'The id of the space.'
      },
      resources: {
        type: new GraphQLList(resourceType),
        description: 'The list of metered resources.'
      },
      consumers: {
        type: new GraphQLList(consumerType),
        description: 'The list of metered consumers.'
      },
      cost: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The usage cost to the space.'
      }
  })
});

const organizationType = new GraphQLObjectType({
  name: 'Organization',
  description: 'An organization.',
  fields: () => ({
      id: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'The id of the aggregated usage doc.'
      },
      organization_id: {
        type: new GraphQLNonNull(GraphQLString),
        description: 'The id of the organization.'
      },
      start: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The start aggregation time.'
      },
      end: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The end aggregation time.'
      },
      resources: {
        type: new GraphQLList(resourceType),
        description: 'The list of metered resources.'
      },
      spaces: {
        type: new GraphQLList(spaceType),
        description: 'The list of spaces.'
      },
      cost: {
        type: new GraphQLNonNull(GraphQLFloat),
        description: 'The usage cost to the organization.'
      }
  })
});

const queryType = new GraphQLObjectType({
  name: 'Query',
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
          return yieldable.promise(orgUsage)(args.organization_id, args.date);
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
          return yieldable.promise(accountUsage)(args.account_id, args.date);
        }
      }
  })
});

const graphSchema = new GraphQLSchema({
  query: queryType
});

// Run a GraphQL query as a generator
const runQuery = function *(query) {
  // Convert the promise returned by graphql to a generator then yield it
  return yield yieldable(graphql(graphSchema, query));
};

// Create an express router
const routes = router();

// Retrieve aggregated usage for a given org and day
routes.get(
  '/v1/organizations/:organization_id/usage/:day', throttle(function *(req) {
    debug('Retrieving aggregated usage for organization %s on %s', req.params
      .organization_id, req.params.day);

    // Retrieve and return the aggregated usage for the given org and time
    const a = yield orgUsage(req.params.organization_id, req.params.day);
    const doc = a ? a : {
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

// Retrieve aggregated usage using a GraphQL query
routes.get(
  '/v1/metering/aggregated/usage/graph/:query', throttle(function *(req) {
    debug(
      'Retrieving aggregated usage using graphql query %s', req.params.query);

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

