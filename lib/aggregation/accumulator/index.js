'use strict';

// Usage accumulator service.

const _ = require('underscore');
const webapp = require('cf-abacus-webapp');
const cluster = require('cf-abacus-cluster');
const router = require('cf-abacus-router');
const dbclient = require('cf-abacus-dbclient');
const batch = require('cf-abacus-batch');
const retry = require('cf-abacus-retry');
const breaker = require('cf-abacus-breaker');
const yieldable = require('cf-abacus-yieldable');
const request = require('cf-abacus-request');
const urienv = require('cf-abacus-urienv');
const seqid = require('cf-abacus-seqid');
const lockcb = require('cf-abacus-lock');
const db = require('cf-abacus-aggregation-db');
const config = require('cf-abacus-service-config');

const omit = _.omit;
const map = _.map;
const zip = _.zip;
const clone = _.clone;
const extend = _.extend;

const post = yieldable(retry(breaker(request.norespost)));

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-usage-accumulator');

// Resolve service URIs
const uris = urienv({ couchdb: 5984, aggregator: 9200 });

// Configure accumulated usage dbs
const accumdb = yieldable(batch(retry(breaker(db(uris.couchdb, 'abacus-accumulated-usage')))));
const logdb = yieldable(batch(retry(breaker(db(uris.couchdb, 'abacus-accumulated-usage-log')))));

// Configure db caches
const accumcache = yieldable(db.cache('abacus-accumulated-usage'));
const logcache = yieldable(db.cache('abacus-accumulated-usage-log'));

// Return a doc location given a route template and params
const loc = (req, template, parms) => req.protocol + '://' + req.headers.host + request.route(template, parms);

// Return the aggregulator partition to post usage to
const aggreguri = function *(k, t) {
    const aggregp = yieldable(db.partition(4));
    const p = yield aggregp(k, t, 'write');
    debug('Target aggregator partition %o', p);
    return /:partition/.test(uris.aggregator) ? request.route(uris.aggregator, { partition: p[0] }) :
        /:port/.test(uris.aggregator) ? request.route(uris.aggregator, { port: 9200 + p[0] }) : uris.aggregator;
};

// Return the accumulation start time for a given time
const day = (t) => {
    var d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the accumulation end time for a given time
const eod = (t) => {
    var d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - 1;
};

// Return service accumulators for a given service id
const accumulators = (sid) => (config(sid) || {aggregations: []}).aggregations;

// Return an accumulator formula for a given service aggregation
const accumfn = (agg) => {
    // parse the formula and return the aggregate function part
    const parse = (f) => typeof f !== 'function' && /\s*(\S*)\(/.exec(f) ? /\s*(\S*)\(/.exec(f)[1] : 'SUM';

    // If there is an accumulate function then use it, else parse the formula to get the corresponding accumulate function for SUM, MAX and AVG
    return agg.accumulate ? agg.accumulate : {
            SUM: (a, c) => (a ? a + c : c),
            MAX: (a, c) => (a ? Math.max(a, c) : c),
            AVG: (a, c) => (a ? {sum: a.sum + c, count: a.count + 1, avg: (a.sum + c) / (a.count + 1)} : {sum: c, count: 1, avg: c})
        }[parse(agg.formula)];
};

// Return the accumulated usage for a service instance in a given time period
const accumulated = function *(orgid, siid, time) {
    const id = dbclient.kturi([orgid, siid].join('-'), day(time));
    debug('Retrieving accumulated usage for %s', id);
    const doc = (yield accumcache.get(id)) || (yield accumdb.get(id));
    if(doc)
        debug('Found accumulated usage %o', doc);
    else
        debug('No existing accumulated usage');
    return doc;
};

// Return any duplicate usage already processed for a service instance in a given time period
const duplicate = function *(orgid, siid, start, end) {
    const id = dbclient.kturi([orgid, siid].join('-'), [day(end), start, end].join('-'));
    debug('Retrieving existing usage for %s', id);
    const doc = (yield logcache.get(id)) || (yield logdb.get(id));
    if(doc)
        debug('Found existing usage %o', doc);
    else
        debug('No existing usage');
    return doc;
};

// Accumulate usage and return new accumulated value
const accumulate = (a, u, def) => {
    // If previous accumulated value is undefined, then initialize one, else clone it
    const newa = !a ? extend(clone(omit(def, 'id')), { start: day(u.end), end: eod(u.end), accumulated_usage: [] }) : clone(a);

    // Calculate new accumulated usage using the accumulator function defined
    // for the service, the previous accumulated usage and the new usage
    extend(newa, { accumulated_usage: map(zip(accumulators(u.service_id), newa.accumulated_usage, u.metered_usage), (r) => {
        const q = r[1] ? r[1].quantity : undefined;
        const newq = accumfn(r[0])(q, r[2].quantity);
        return { unit: r[0].id, quantity: newq, delta: newq - (q || 0) };
    })});

    debug('New accumulated usage %o', newa);
    return newa;
};

// Log the processed usage and log and update corresponding accumulated usage
const store = function *(a, u) {
    const k = [a.organization_guid, a.service_instance_id].join('-');

    // Log the processed usage
    const ulogid = dbclient.kturi(k, [a.start, u.start, u.end].join('-'));
    debug('Logging processed usage %s', ulogid);
    const ulogdoc = extend(clone(u), { id: ulogid, metered_usage_id: u.id });
    const ulogrev = yield logdb.put(extend(clone(ulogdoc), { _id: ulogid }));
    yield logcache.put(extend(clone(ulogdoc), { _id: ulogid, dbrev: ulogrev.rev }));
    debug('Logged processed usage %o', ulogdoc);

    // Log the accumulated usage
    const alogid = dbclient.kturi(k, [a.start, seqid()].join('-'));
    debug('Logging accumulated usage %s', alogid);
    const alogdoc = extend(clone(omit(a, 'dbrev')), { id: alogid, processed_usage_id: ulogid });
    yield accumdb.put(extend(clone(alogdoc), { _id: alogid }));
    debug('Logged accumulated usage %o', alogdoc);

    // Update the accumulated usage
    const aid = dbclient.kturi(k, a.start);
    debug('Updating accumulated usage %s', aid);
    const adoc = extend(clone(omit(a, 'dbrev')), { id: aid, last_accumulated_usage_id: alogid, processed_usage_id: ulogid });
    const arev = yield accumdb.put(extend(clone(adoc), { _id: aid }, a.dbrev ? { _rev: a.dbrev } : {}));
    yield accumcache.put(extend(clone(adoc), { _id: aid, dbrev: arev.rev }));
    debug('Updated accumulated usage %o', adoc);

    // Post to the target aggregator service partition
    yield post((yield aggreguri(a.organization_guid, a.start)) + '/v1/metering/accumulated/usage', { body: alogdoc });
    return alogid;
};

// Accumulate the given usage
const accumulateUsage = function *(u) {
    // Retrieve last accumulated usage for the given service instance and time
    const a = yield accumulated(u.organization_guid, u.service_instance_id, u.end);

    // Skip duplicate usage for a given service instance and time period
    const dup = yield duplicate(u.organization_guid, u.service_instance_id, u.start, u.end);
    if(dup) {
        debug('Skipping duplicate usage %o', u);
        return a.id;
    }

    // Accumulate usage
    const newa = accumulate(a, u, u);

    // Store new accumulated usage
    return yield store(newa, u);
};

// Create an express router
const routes = router();

// Accumulate usage for a given service instance
routes.post('/v1/metering/metered/usage', function *(req) {
    const u = req.body;

    // Make sure to process one accumulation request at a time for a given
    // partition, app instance, org and service instance id
    const unlock = yield lock([u.organization_guid, u.service_instance_id].join('-'));
    try {

        // Accumulate usage
        debug('Accumulating usage %o', u);
        const id = yield accumulateUsage(u);

        // Return the location of the new accumulated usage
        return { statusCode: 201, header: { Location: loc(req, '/v1/metering/accumulated/usage/:id', { id: id }) }};
    }
    finally {
        unlock();
    }
});

// Retrieve accumulated usage
routes.get('/v1/metering/accumulated/usage/:id', function *(req) {
    debug('Retrieving accumulated usage for id %s', req.params.id);

    // Retrieve and return the accumulated usage doc
    const doc = omit(yield accumdb.get(req.params.id), ['_id', '_rev']);
    return { body: doc };
});

// Perform recovery logic when the application starts
const recover = () => {
    // Process any unprocessed docs from our input db

    // TODO insert our recovery logic here
};

// Create an accumulator app
const accumulator = () => {
    // Configure Node cluster to use a single process as we want to serialize
    // accumulation requests per db partition and app instance
    cluster.single();

    // Perform recovery if needed
    recover();

    // Create the Webapp
    const app = webapp();
    app.use(routes);
    return app;
};

// Command line interface, create the accumulator app and listen
const runCLI = () => accumulator().listen();

// Export our public functions
module.exports = accumulator;
module.exports.runCLI = runCLI;

