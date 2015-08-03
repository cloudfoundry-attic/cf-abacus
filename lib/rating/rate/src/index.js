'use strict';

// Usage rating service

const _ = require('underscore');
const yieldable = require('abacus-yieldable');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const request = require('abacus-request');
const config = require('abacus-service-config');
const prices = require('abacus-price-config');
const db = require('abacus-aggregation-db');

const map = _.map;
const filter = _.filter;
const clone = _.clone;
const extend = _.extend;
const omit = _.omit;

// Resolve service URIs
const uris = urienv({ couchdb: 5984 });

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-rate');

// Configure rating usage db
const ratedb = yieldable(batch(retry(breaker(db(uris.couchdb, 'abacus-rated-usage')))));

// Return a doc location given a route template and params
const loc = (req, template, params) => req.protocol + '://' + req.headers.host + request.route(template, params);

// Return a function that returns a rating function for a given service id
const getratefn = (sid) => {
    // Get all aggregations for a given service id
    const aggs = (config(sid) || {aggregations: []}).aggregations;
    return (u) => {
        // Find the aggregation with the matching unt of the id
        const f = filter(aggs, (agg) => agg.id === u);
        // If the rating function is defined use it, otherwise use a default function that returns 0
        return f.length && f[0].rate ? f[0].rate : (p, qty) => 0;
    };
};

// Return the price for the given service, plan, unit, and country
const getprice = (sid, pid, uid, country) => {
    // Retrieve the service price file
    const service = prices(sid);
    if(service) {
        // Find the specific plan of the usage
        const plan = filter(service.plans, (p) => p.id === pid);
        if(plan.length) {
            // Find the specific unit's price
            const resource = filter(plan[0].resources, (r) => r.id === uid);
            // Use the correct price based on country or use 0 if it doesn't exist
            const price = filter(resource[0].prices, (p) => p.country === country);
            return price.length ? price[0].price : 0;
        }
    }
    return 0;
};

// Rates usage at a given aggregation level
const rateusage = (u) => {
    return extend(clone(u), { services: map(u.services, (service) => {
        // Get the rating function based on the given service
        const ratefn = getratefn(service.id);

        // Retrieve the price and apply the calculation to the quantity
        return {id: service.id, plan_id: service.plan_id,
            aggregated_usage: map(service.aggregated_usage, (a) => ({
                unit: a.unit,
                quantity: a.quantity,
                cost: ratefn(a.unit)(getprice(service.id, service.plan_id, a.unit, 'USA'), a.quantity)
            }))
        };
    })});
};

// Rates a given aggregated usage
const rate = (u) => {
    // Rate the organization-level aggregation
    const rated = rateusage(u);

    // Rate the space-level aggregation
    rated.spaces = map(u.spaces, (s) => {
        const ratedspace = rateusage(s);
        // Rate the consumer-level aggregation
        ratedspace.consumers = map(s.consumers, (c) => {
            return rateusage(c);
        });
        return ratedspace;
    });
    return rated;
};

// Update the rated usage
const store = function *(r) {
    const rid = dbclient.kturi(r.organization_guid, r.start);
    debug('Updating rated usage %s', rid);
    const rdoc = extend(clone(r), { id: rid });
    yield ratedb.put(extend(clone(rdoc), { _id: rid }));
    debug('Updated rated usage %o', rdoc);
    return rid;
};

// Create an express router
const routes = router();

// Rate a given aggregated usage
routes.post('/v1/rating/usage', function *(req) {
    debug('Received usage to be rated %o', req.body);

    // Validate the input
    if(!req.body) return {statusCode: 400};

    // Rate the usage
    const r = rate(req.body);

    // Store rated usage into the database
    const id = yield store(r);

    return { statusCode: 201, header: { Location: loc(req, '/v1/rating/rated/usage/:id', { id: id }) }};
});

// Retrieve the rated usage associated with the given id
routes.get('/v1/rating/rated/usage/:id', function *(req) {
    debug('Retrieving rated usage for id %s', req.params.id);

    // Retrieve and return the metered usage doc, and clone it without _id and _rev properties
    const doc = omit(yield ratedb.get(req.params.id), ['_id', '_rev']);

    // return the doc as response body
    return { body: doc };
});

// Perform recovery logic when the application starts
const recover = () => {
    // Process any unprocessed docs from our input db

    // TODO insert our recovery logic here
};

// Create a rate app
const rateapp = () => {
    // Perform recovery if necessary
    recover();

    // Create the Webapp
    const app = webapp();
    app.use(routes);
    return app;
};

// Command line interface, create the rate app and listen
const runCLI = () => rateapp().listen();

// Export public methods
module.exports = rateapp;
module.exports.rate = rate;
module.exports.runCLI = runCLI;
