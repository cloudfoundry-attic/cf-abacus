'use strict';

// Usage accumulator service.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const seqid = require('abacus-seqid');
const lockcb = require('abacus-lock');
const db = require('abacus-aggregation-db');
const config = require('abacus-service-config');

const omit = _.omit;
const map = _.map;
const zip = _.zip;
const clone = _.clone;
const extend = _.extend;

const brequest = batch(request);
const post = yieldable(retry(breaker(brequest.noWaitPost)));

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-accumulator');

// Resolve service URIs
const uris = urienv({ couchdb: 5984, aggregator: 9200 });

// Configure accumulated usage dbs
const accumdb = yieldable(retry(breaker(db(uris.couchdb, 'abacus-accumulated-usage'))));
const logdb = yieldable(retry(breaker(batch(db(uris.couchdb, 'abacus-accumulated-usage-log')))));

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
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the accumulation end time for a given time
const eod = (t) => {
    const d = new Date(t);
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
            SUM: (a, c) => a ? a + c : c,
            MAX: (a, c) => a ? Math.max(a, c) : c,
            AVG: (a, c) => a ? {sum: a.sum + c, count: a.count + 1, avg: (a.sum + c) / (a.count + 1)} : {sum: c, count: 1, avg: c}
        }[parse(agg.formula)];
};

// Accumulate usage and return new accumulated value
const accumulate = (a, u) => {
    // If previous accumulated value is undefined, then initialize one, else clone it
    const umerge = omit(u, 'id', 'resources', 'metered_usage');
    const amerge = !a ? extend({ start: day(u.end), end: eod(u.end), accumulated_usage: [] }, umerge) : extend(clone(a), umerge);

    // Calculate new accumulated usage using the accumulator function defined
    // for the service, the previous accumulated usage and the new usage
    const newa = extend(clone(amerge), { accumulated_usage: map(zip(accumulators(u.service_id), amerge.accumulated_usage, u.metered_usage),
        (r) => {
            const q = r[1] ? r[1].quantity : undefined;
            const newq = accumfn(r[0])(q, r[2].quantity);
            return { unit: r[0].id, quantity: newq, delta: newq - (q || 0) };
        })});

    debug('New accumulated usage %o', newa);
    return newa;
};

// Return the accumulated usage for a service instance in a given time period
const accumulatedUsage = function *(id) {
    debug('Retrieving accumulated usage for %s', id);
    const doc = (yield accumcache.get(id)) || (yield accumdb.get(id));
    if(doc)
        debug('Found accumulated usage %o in %s', doc, doc.dbrev ? 'cache' : 'db');
    else
        debug('No existing accumulated usage');
    return doc;
};

// Log new usage and return whether it's a duplicate or not
const logUsage = function *(u, alogid, ulogid) {
    const unlock = yield lock(ulogid);
    try {
        // Look for a duplicate usage
        debug('Search for existing usage for %s', ulogid);
        const dupdoc = (yield logcache.get(ulogid)) || (yield logdb.get(ulogid));
        if(dupdoc) {
            debug('Found existing usage %o in %s', dupdoc, dupdoc.dbrev ? 'cache' : 'db');
            return dupdoc;
        }

        // Log the new usage
        debug('Logging new usage %s', ulogid);
        const logdoc = extend(clone(u), { id: ulogid, metered_usage_id: u.id, last_accumulated_usage_id: alogid });
        const logrev = yield logdb.put(extend(clone(logdoc), { _id: ulogid }));
        yield logcache.put(extend(clone(logdoc), { _id: ulogid, dbrev: logrev.rev }));
        debug('Logged new usage %o', logdoc);
        return undefined;
    }
    finally {
        unlock();
    }
};

// Log accumulated usage
const logAccumulatedUsage = function *(alogdoc, alogid) {
    debug('Logging accumulated usage %s', alogid);
    yield logdb.put(extend(clone(alogdoc), { _id: alogid }));
    debug('Logged accumulated usage %o', alogdoc);
    return alogdoc;
};

// Store accumulated usage
const storeAccumulatedUsage = function *(a, aid, alogid, ulogid) {
    debug('Updating accumulated usage %s', aid);
    const adoc = extend(clone(omit(a, 'dbrev')), { id: aid, last_accumulated_usage_id: alogid, processed_usage_id: ulogid });
    const arev = yield accumdb.put(extend(clone(adoc), { _id: aid }, a.dbrev ? { _rev: a.dbrev } : {}));
    yield accumcache.put(extend(clone(adoc), { _id: aid, dbrev: arev.rev }));
    debug('Updated accumulated usage %o', adoc);
    return aid;
};

// Accumulate the given usage
const accumulateUsage = function *(u) {
    // Compute the usage log id and accumulated usage id
    const k = [u.organization_guid, u.service_instance_id].join('-');
    const ulogid = dbclient.kturi(k, [day(u.end), u.start, u.end].join('-'));
    const alogid = dbclient.kturi(k, [day(u.end), seqid()].join('-'));
    const aid = dbclient.kturi(k, day(u.end));

    // Log the given usage
    const dup = yield logUsage(u, alogid, ulogid);
    if(dup) {
        debug('Skipping duplicate usage %o', u);
        return dup.last_accumulated_usage_id;
    }

    const unlock = yield lock(aid);
    let newa;
    try {
        // Retrieve the accumulated usage for the given service instance and
        // time period
        const a = yield accumulatedUsage(aid);

        // Accumulate new usage
        newa = accumulate(a, u, u);

        // Store the new accumulated usage
        yield storeAccumulatedUsage(newa, aid, alogid, ulogid);
    }
    finally {
        unlock();
    }

    // Post the new accumulated usage to the target aggregator service partition
    const alogdoc = extend(clone(omit(newa, 'dbrev')), { id: alogid, processed_usage_id: ulogid });
    yield post((yield aggreguri(alogdoc.organization_guid, alogdoc.start)) + '/v1/metering/accumulated/usage', { body: alogdoc });

    // Log the new accumulated usage
    yield logAccumulatedUsage(alogdoc, alogid);
    return alogid;
};

// Create an express router
const routes = router();

// Accumulate usage for a given service instance
routes.post('/v1/metering/metered/usage', throttle(function *(req) {
    const u = req.body;

    // Accumulate usage
    debug('Accumulating usage %o', u);
    const id = yield accumulateUsage(u);

    // Return the location of the new accumulated usage
    return { statusCode: 201, header: { Location: loc(req, '/v1/metering/accumulated/usage/:id', { id: id }) }};
}));

// Retrieve accumulated usage
routes.get('/v1/metering/accumulated/usage/:id', throttle(function *(req) {
    debug('Retrieving accumulated usage for id %s', req.params.id);

    // Retrieve and return the accumulated usage doc
    const doc = omit(yield logdb.get(req.params.id), ['_id', '_rev']);
    return { body: doc };
}));

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
    app.use(router.batch(routes));
    return app;
};

// Command line interface, create the accumulator app and listen
const runCLI = () => accumulator().listen();

// Export our public functions
module.exports = accumulator;
module.exports.runCLI = runCLI;

