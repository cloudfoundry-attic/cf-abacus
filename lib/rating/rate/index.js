'use strict';

// Usage rating service

const _ = require('underscore');
const webapp = require('cf-abacus-webapp');
const router = require('cf-abacus-router');
const config = require('cf-abacus-service-config');
const prices = require('cf-abacus-price-config');

const map = _.map;
const filter = _.filter;

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-usage-rate');

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

// Rates a given aggregated usage
const rate = (u) => {
    return map(u.services, (service) => {
        // Get the rating function based on the given service
        const ratefn = getratefn(service.id);
        map(service.aggregated_usage, (a) => {
            // Calculate the cost of the given aggregation unit and quantity associated with it
            a.cost = ratefn(a.unit)(getprice(service.id, service.plan_id, a.unit, 'USA'), a.quantity);
        });
    });
};

const routes = router();

// Rate a given aggregated usage
routes.post('/v1/rating/usage', function *(req) {
    debug('Received usage to be rated %o', req.body);

    // Validate the input
    if(!req.body) return {statusCode: 400};

    // Rate the usage
    rate(req.body);

    return { statusCode: 200 };
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
module.exports.rate = rate;
module.exports.runCLI = runCLI;
