'use strict';

// Usage aggregator service.

const _ = require('underscore');
const webapp = require('cf-abacus-webapp');
const cluster = require('cf-abacus-cluster');
const router = require('cf-abacus-router');
const dbclient = require('cf-abacus-dbclient');
const batch = require('cf-abacus-batch');
const retry = require('cf-abacus-retry');
const breaker = require('cf-abacus-breaker');
const yieldable = require('cf-abacus-yieldable');
const throttle = require('cf-abacus-throttle');
const request = require('cf-abacus-request');
const urienv = require('cf-abacus-urienv');
const seqid = require('cf-abacus-seqid');
const lockcb = require('cf-abacus-lock');
const db = require('cf-abacus-aggregation-db');
const config = require('cf-abacus-service-config');

const extend = _.extend;
const filter = _.filter;
const map = _.map;
const omit = _.omit;
const clone = _.clone;

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-usage-aggregator');

// Resolve service URIs
const uris = urienv({ couchdb: 5984 });

// Configure aggregated usage db
const aggrdb = yieldable(retry(breaker(db(uris.couchdb, 'abacus-aggregated-usage'))));
const logdb = yieldable(retry(breaker(batch(db(uris.couchdb, 'abacus-aggregated-usage-log')))));

// Configure db cache
const aggrcache = yieldable(db.cache('abacus-aggregated-usage'));

// Find an element with the specified id in a list, and lazily construct and
// add a new one if no element is found
const lazyCons = (l, id, cons, prop) => {
    const f = filter(l, e => e[prop || 'id'] === id);
    if(f.length) return f[0];
    const e = new cons(id);
    l.push(e);
    return e;
};

// Define the objects used to represent a hiearchy of aggregated usage inside
// an organization

// Represent an org, aggregated service usage and the spaces it contains
const Org = function(id) { extend(this, { organization_guid: id, services: [], spaces: [] }); };
const newOrg = function(id) { return new Org(id); };
Org.prototype.service = function(id) { return lazyCons(this.services, id, Org.Service); };
Org.prototype.space = function(id) { return lazyCons(this.spaces, id, Org.Space); };

// Represent a space, aggregated service usage and the consumers it contains
Org.Space = function(id) { extend(this, { id: id, services: [], consumers: [] }); };
Org.Space.prototype.service = function(id) { return lazyCons(this.services, id, Org.Service); };
Org.Space.prototype.consumer = function(id) { return lazyCons(this.consumers, id, Org.Consumer); };

// Represent a consumer and aggregated service usage
Org.Consumer = function(id) { extend(this, { id: id, services: [] }); };
Org.Consumer.prototype.service = function(id) { return lazyCons(this.services, id, Org.Service); };

// Represent a service and its aggregated resource usage
Org.Service = function(id) { extend(this, { id: id, aggregated_usage: [] }); };
Org.Service.prototype.resource = function(unit) { return lazyCons(this.aggregated_usage, unit, Org.Resource, 'unit'); };

// Represent a resource aggregated usage
Org.Resource = function(unit) { extend(this, { unit: unit, quantity: 0 }); };

// Revive an org object
const reviveOrg = (org) => {
    org.service = Org.prototype.service;
    org.space = Org.prototype.space;
    map(org.services, (s) => {
        s.resource = Org.Service.prototype.resource;
    });
    map(org.spaces, (s) => {
        s.service = Org.Space.prototype.service;
        s.consumer = Org.Space.prototype.consumer;
        map(s.services, (s) => {
            s.resource = Org.Service.prototype.resource;
        });
        map(s.consumers, (c) => {
            c.service = Org.Consumer.prototype.service;
            map(c.services, (s) => {
                s.resource = Org.Service.prototype.resource;
            });
        });
    });
    return org;
};

// Return a doc location given a route template and params
const loc = (req, template, parms) => req.protocol + '://' + req.headers.host + request.route(template, parms);

// Return the aggregation start time for a given time
const day = (t) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the aggregation end time for a given time
const eod = (t) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - 1;
};

// Return a function to get an aggregate function from a service for an aggregation unit
const saggr = (sid) => {
    // Get all aggregations for a given service id
    const aggs = (config(sid) || {aggregations: []}).aggregations;
    return (u) => {
        // Find the aggregation with matching unit as id
        const f = filter(aggs, (agg) => agg.id === u);
        // If aggregate function is defined use it, else use the default sum function
        return f.length && f[0].aggregate ? f[0].aggregate : (a, qty) => a ? a + qty : qty;
    };
};

// Aggregate usage and return new aggregation
const aggregate = (a, u) => {
    // Revive the org aggregated usage object behavior
    const newa = reviveOrg(a);

    const saggrfn = saggr(u.service_id);

    // Go through the incoming accumulated usage unit and quantity
    map(u.accumulated_usage, (ua) => {
        const unit = ua.unit;
        const delta = ua.delta;

        // Find the aggregate function for a given unit and use it to aggregate the quantity
        const aggrfn = (a, delta) => {
            // We're mutating the input quantity here but it's really the simplest
            // way to apply the formula
            a.quantity = saggrfn(a.unit)(a.quantity, delta);
        };

        aggrfn(newa.service(u.service_id).resource(unit), delta);
        aggrfn(newa.space(u.space_guid).service(u.service_id).resource(unit), delta);
        aggrfn(newa.space(u.space_guid).consumer(u.consumer ? u.consumer.value : 'all').service(u.service_id).resource(unit), delta);
    });

    // Remove org aggregated usage object behavior and return
    const jsa = JSON.parse(JSON.stringify(newa));
    debug('New aggregated usage %o', jsa);
    return jsa;
};

// Return the last aggregated usage for an org in a given time period
const aggregatedUsage = function *(id) {
    debug('Retrieving aggregated usage for %s', id);
    const doc = (yield aggrcache.get(id)) || (yield aggrdb.get(id));
    if(doc)
        debug('Found aggregated usage %o in %s', doc, doc.dbrev ? 'cache' : 'db');
    else
        debug('No existing aggregated usage');
    return doc;
};

// Log accumulated usage
const logAggregatedUsage = function *(alogdoc, alogid) {
    debug('Logging aggregated usage %s', alogid);
    yield logdb.put(extend(clone(alogdoc), { _id: alogid }));
    debug('Logged aggregated usage %o', alogdoc);
    return alogdoc;
};

// Update the aggregated usage
const storeAggregatedUsage = function *(a, aid, alogid, uid) {
    debug('Updating aggregated usage %s', aid);
    const adoc = extend(clone(omit(a, 'dbrev')), { id: aid, last_aggregated_usage_id: alogid, accumulated_usage_id: uid });
    const arev = yield aggrdb.put(extend(clone(adoc), { _id: aid }, a.dbrev ? { _rev: a.dbrev } : {}));
    yield aggrcache.put(extend(clone(adoc), { _id: aid, dbrev: arev.rev }));
    debug('Updated aggregated usage %o', adoc);
    return aid;
};

// Aggregate the given accumulated usage
const aggregateUsage = function *(u) {
    // Compute the usage log id and aggregated usage id
    const aid = dbclient.kturi(u.organization_guid, day(u.end));
    const alogid = dbclient.kturi(u.organization_guid, [day(u.end), seqid()].join('-'));
    const uid = u.id;

    const unlock = yield lock(aid);
    let newa;
    try {
        // Retrieve last aggregated usage for the given org and time
        const a = yield aggregatedUsage(aid);

        // Aggregate usage
        newa = aggregate(a ? a : extend(newOrg(u.organization_guid), { start: day(u.end), end: eod(u.end) }), u);

        // Store new aggregated usage
        yield storeAggregatedUsage(newa, aid, alogid, uid);
    }
    finally {
        unlock();
    }

    // Log the new aggregated usage
    const alogdoc = extend(clone(omit(newa, 'dbrev', '_rev')), { id: alogid, accumulated_usage_id: u.id });
    yield logAggregatedUsage(alogdoc, alogid);
    return alogid;
};

// Create an express router
const routes = router();

// Aggregate accumulated usage for a given service instance
routes.post('/v1/metering/accumulated/usage', throttle(function *(req) {
    const u = req.body;

    // Aggregate usage
    debug('Aggregating usage %o', u);
    const id = yield aggregateUsage(u);

    // Return the location of the new aggregated usage
    return { statusCode: 201, header: { Location: loc(req, '/v1/metering/aggregated/usage/:id', { id: id }) }};
}));

// Retrieve aggregated usage
routes.get('/v1/metering/aggregated/usage/:id', throttle(function *(req) {
    debug('Retrieving aggregated usage for id %s', req.params.id);

    // Retrieve and return the aggregated usage doc
    const doc = omit(yield aggrdb.get(req.params.id), ['_id', '_rev']);
    return { body: doc };
}));

// Perform recovery logic when the application starts
const recover = () => {
    // Process any unprocessed docs from our input db

    // TODO insert our recovery logic here
};

// Create an aggregator app
const aggregator = () => {
    // Configure Node cluster to use a single process as we want to serialize
    // accumulation requests per db partition and app instance
    cluster.single();

    // Perform recovery if needed
    recover();

    // Create the Webapp
    const app = webapp();
    app.use(routes);
    app.use(router.batch(routes));
    return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => aggregator().listen();

// Export our public functions
module.exports = aggregator;
module.exports.newOrg = newOrg;
module.exports.reviveOrg = reviveOrg;
module.exports.runCLI = runCLI;

