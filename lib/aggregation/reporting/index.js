'use strict';

// A simple reporting service for aggregated usage.

const _ = require('underscore');
const webapp = require('cf-abacus-webapp');
const router = require('cf-abacus-router');
const dbclient = require('cf-abacus-dbclient');
const batch = require('cf-abacus-batch');
const retry = require('cf-abacus-retry');
const breaker = require('cf-abacus-breaker');
const yieldable = require('cf-abacus-yieldable');
const throttle = require('cf-abacus-throttle');
const request = require('cf-abacus-request');
const urienv = require('cf-abacus-urienv');
const transform = require('cf-abacus-transform');
const db = require('cf-abacus-aggregation-db');
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
const debug = require('cf-abacus-debug')('cf-abacus-usage-reporting');

// Resolve service URIs
const uris = urienv({ couchdb: 5984, account: 9381 });

// Configure aggregated usage db
const aggrdb = yieldable(retry(breaker(batch(db(uris.couchdb, 'abacus-aggregated-usage')))));

// Return the aggregation start time for a given time
const day = (t) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the aggregated usage for an org in a given time period
const orgUsage = function *(orgid, time) {
    const id = dbclient.kturi(orgid, day(Date.parse(time)));
    debug('Retrieving aggregated usage for %s', id);
    const doc = yield aggrdb.get(id);
    if(doc)
        debug('Found aggregated usage %o', doc);
    else
        debug('No existing aggregated usage');
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
    const account = yield get(uris.account + '/v1/accounts/:account_id', { account_id: accountid });
    if(!account.body || !account.body.organizations)
        return undefined;
    return yield orgsUsage(account.body.organizations, time);
};

// GraphQL schema for aggregated usage
const resourceType = new GraphQLObjectType({
    name: 'Resource', description: 'A metered resource.',
    fields: () => ({
        unit: { type: new GraphQLNonNull(GraphQLString), description: 'The unit used to meter usage.' },
        quantity: { type: new GraphQLNonNull(GraphQLFloat), description: 'The usage quantity.' }
    })
});

const serviceType = new GraphQLObjectType({
    name: 'Service', description: 'A metered service.',
    fields: () => ({
        id: { type: new GraphQLNonNull(GraphQLString), description: 'The id of the service.' },
        aggregated_usage: { type: new GraphQLList(resourceType), description: 'The list of metered resources.' }
    })
});

const consumerType = new GraphQLObjectType({
    name: 'Consumer', description: 'A consumer.',
    fields: () => ({
        id: { type: new GraphQLNonNull(GraphQLString), description: 'The id of the consumer.' },
        services: { type: new GraphQLList(serviceType), description: 'The list of metered services.' }
    })
});

const spaceType = new GraphQLObjectType({
    name: 'Space', description: 'A space.',
    fields: () => ({
        id: { type: new GraphQLNonNull(GraphQLString), description: 'The id of the space.' },
        services: { type: new GraphQLList(serviceType), description: 'The list of metered services.' },
        consumers: { type: new GraphQLList(consumerType), description: 'The list of metered consumers.' }
    })
});

const organizationType = new GraphQLObjectType({
    name: 'Organization', description: 'An organization.',
    fields: () => ({
        id: { type: new GraphQLNonNull(GraphQLString), description: 'The id of the aggregated usage doc.' },
        organization_guid: { type: new GraphQLNonNull(GraphQLString), description: 'The id of the organization.' },
        start: { type: new GraphQLNonNull(GraphQLFloat), description: 'The start aggregation time.' },
        end: { type: new GraphQLNonNull(GraphQLFloat), description: 'The end aggregation time.' },
        services: { type: new GraphQLList(serviceType), description: 'The list of metered services.' },
        spaces: { type: new GraphQLList(spaceType), description: 'The list of spaces.' }
    })
});

const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: () => ({
        organization: {
            type: organizationType,
            args: {
                organization_guid: { name: 'organization_guid', type: new GraphQLNonNull(GraphQLString) },
                date: { name: 'date', type: new GraphQLNonNull(GraphQLString) }
            },
            resolve: (root, args) => { return yieldable.promise(orgUsage)(args.organization_guid, args.date); }
        },
        organizations: {
            type: new GraphQLList(organizationType),
            args: {
                organization_guids: { name: 'organization_guids', type: new GraphQLList(GraphQLString) },
                date: { name: 'date', type: new GraphQLNonNull(GraphQLString) }
            },
            resolve: (root, args) => { return yieldable.promise(orgsUsage)(args.organization_guids, args.date); }
        },
        account: {
            type: new GraphQLList(organizationType),
            args: {
                account_id: { name: 'account_id', type: new GraphQLNonNull(GraphQLString) },
                date: { name: 'date', type: new GraphQLNonNull(GraphQLString) }
            },
            resolve: (root, args) => { return yieldable.promise(accountUsage)(args.account_id, args.date); }
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
routes.get('/v1/organizations/:organization_guid/usage/:day', throttle(function *(req) {
    debug('Retrieving aggregated usage for organization %s on %s', req.params.organization_guid, req.params.day);

    // Retrieve and return the aggregated usage for the given org and time
    const a = yield orgUsage(req.params.organization_guid, req.params.day);
    const doc = a ? a : { id: req.params.organization_guid, services: [], spaces: [] };
    return { body: omit(doc, '_id', '_rev', 'last_aggregated_usage_id', 'accumulated_usage_id') };
}));

// Retrieve aggregated usage using a GraphQL query
routes.get('/v1/metering/aggregated/usage/graph/:query', throttle(function *(req) {
    debug('Retrieving aggregated usage using graphql query %s', req.params.query);

    // Run the given GraphQL query and return the result
    const doc = yield runQuery(req.params.query);
    debug('Graphql query result %o', doc);

    return { body: omit(doc.data, '_id', '_rev', 'last_aggregated_usage_id', 'accumulated_usage_id') };
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

