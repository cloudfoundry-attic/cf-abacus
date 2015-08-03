'use strict';

// Usage meter service, responsible for applying the configured metering
// functions to usage submitted by service providers.

const _ = require('underscore');
const yieldable = require('abacus-yieldable');
const router = require('abacus-router');
const request = require('abacus-request');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const throttle = require('abacus-throttle');
const dbclient = require('abacus-dbclient');
const webapp = require('abacus-webapp');
const seqid = require('abacus-seqid');
const urienv = require('abacus-urienv');
const config = require('abacus-service-config');
const db = require('abacus-metering-db');

const map = _.map;
const rest = _.rest;
const extend = _.extend;
const reduce = _.reduce;
const keys = _.keys;
const values = _.values;
const flatten = _.flatten;
const clone = _.clone;
const omit = _.omit;

const brequest = batch(request);
const post = yieldable(retry(breaker(brequest.noWaitPost)));

/* eslint no-eval: 1 */
/* jshint evil: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-meter');

// Resolve service URIs
const uris = urienv({ couchdb: 5984, accumulator: 9100 });

// Configure metered usage db
const meterdb = yieldable(retry(breaker(batch(db(uris.couchdb, 'abacus-metered-usage')))));

// Return a doc location given a route template and params
const loc = (req, template, params) => req.protocol + '://' + req.headers.host + request.route(template, params);

// Return the accumulator partition URI to post usage to
const accumuri = function *(k, t) {
    const accump = yieldable(db.partition(4));
    const p = yield accump(k, t, 'write');
    debug('Target accumulator partition %o', p);
    return /:partition/.test(uris.accumulator) ? request.route(uris.accumulator, { partition: p[0] }) :
        /:port/.test(uris.accumulator) ? request.route(uris.accumulator, { port: 9100 + p[0] }) : uris.accumulator;
};

// Given an usage record, get the service id
const sid = (usage) => usage.service_id;

// Given a dsl formula, creates pairs of operands and operators
// ex: SUM({BYTE}/12*{Memory.INSTANCE}*{HOUR}) is split into ['{BYTE}/', '12*', '{Memory.INSTANCE}*', '{HOUR}']
// then ['{BYTE}/', '12*', '{Memory.INSTANCE}*', '{HOUR}'] is mapped to [['BYTE', '/'], ['12', '*'], ['Memory.INSTANCE', '*'], ['HOUR', '']]
const dslpairs = (f) => map(rest(f.match(/\s*{\s*[\w.]*\s*}[*//+-]?|\s*\w+\s*[*//+-]?/g)), (s) => rest(s.match(/\s*{?\s*([\w.]*)\s*}?([*//+-]?)/)));

// Given a set of dsl pairs, creates a formula string
// ex: [['BYTE', '/'], ['12', '*'], ['Memory.INSTANCE', '*'], ['HOUR', '']]$ is mapped to [['r.BYTE', '/'], ['12', '*'], ['r.Memory.INSTANCE', '*'], ['r.HOUR', '']]
// [['r.BYTE', '/'], ['12', '*'], ['r.Memory.INSTANCE', '*'], ['r.HOUR', '']] is flattened to ['r.BYTE', '/', '12', '*', 'r.Memory.INSTANCE', '*', 'r.HOUR', '']
// ['r.BYTE', '/', '12', '*', 'r.Memory.INSTANCE', '*', 'r.HOUR', ''] is reduced to 'r.BYTE / 12 * r.Memory.INSTANCE * r.HOUR'
const dslformula = (f) => reduce(flatten(map(dslpairs(f), (p) => {
    if(isNaN(p[0]) === true) {
        let o = clone(p);
        o[0] = 'r.' + p[0];
        return o;
    }
    return p;
})), (s, v) => v ? s ? s + ' ' + v : v : s);

// Converts usage resources into an object that can be used by dsl formual using javascript property access syntax
// ex: {resources: [{unit: 'unit1', quantity: 1}, {name: 'resource2', unit: 'unit2', quantity: 2}, {name: 'resource2', unit: 'unit3', quantity: 3},
//      {unit: 'unit4', quantity: 4}]} is mapped into  [{unit1: 1}, {resource2: {unit2: 2}}, {resource2: {unit3: 3}}, {unit4: 4}]
// [{unit1: 1}, {resource2: {unit2: 2}}, {resource2: {unit3: 3}}, {unit4: 4}] is reduced to {unit1: 1, resource2: {unit2: 2, unit3: 3}, {unit4: 4}}
const resources = (u) => {
    return reduce(map(u.resources, (r) => {
        let o = {};
        if (r.name) {
            o[r.name] = {};
            o[r.name][r.unit] = r.quantity;
        } else o[r.unit] = r.quantity;

        return o;
    }), (d, s) => {
        const k = keys(s)[0];
        if (typeof s === 'object' && d[k]) {
            let o = {};
            o[k] = extend(d[k], values(s)[0]);
            return extend(d, o);
        }
        return extend(d, s);
    }, {});
};

// Return service consumers for a given service id
const consumers = (sid) => (config(sid) || {aggregations: []}).aggregations;

// Return metered usage value based on the metering function for a given
// service
const consume = (a) => {
    return (u) => {
        // Translate u.resources to an object expected by the consumer function
        const r = resources(u);

        // If there is an consumer function then use it, else parse the formula, construct consumer function and then evaluate
        return typeof a.formula === 'function' ? a.formula(r) : eval(dslformula(a.formula));
    };
};


const meter = (u) => {
    debug('Usage %o', u);

    // Add metered usage property with quantities based on the consumption
    // formulas for each aggregations
    const mu = extend(clone(u), { metered_usage: map(consumers(sid(u)), (a) => ({ unit: a.id, quantity: consume(a)(u) })) });

    debug('Metered usage %o', mu);
    return mu;
};

// Create an express router
const routes = router();

// Meter usage for a given service instance
routes.post('/v1/metering/usage', throttle(function *(req) {
    debug('Received usage to be metered %o', req.body);

    // Validate the input
    if (!req.body) return { statusCode: 400 };

    // Meter the usage
    const u = meter(req.body);

    // Log the metered usage
    const k = [u.organization_guid, u.service_instance_id].join('-');
    const t = seqid();
    const id = dbclient.tkuri(k, t);
    const doc = extend(clone(u), { _id: id, id: id, usage_id: u.id });
    yield meterdb.put(doc);
    debug('Logged metered usage %o', doc);

    // Post to the target accumulator service partition
    yield post((yield accumuri(u.organization_guid, t)) + '/v1/metering/metered/usage', { body: doc });

    // return 201 with the usage location URL
    return { statusCode: 201, header: { Location: loc(req, '/v1/metering/metered/usage/:id', { id: id }) }};
}));

// Retrieve a metered usage doc
routes.get('/v1/metering/metered/usage/:id', throttle(function *(req) {
    debug('Retrieving metered usage for id %s', req.params.id);

    // Retrieve and return the metered usage doc, and clone it without _id and _rev properties
    const doc = omit(yield meterdb.get(req.params.id), ['_id', '_rev']);

    // return the doc as response body
    return { body: doc };
}));

// Perform recovery logic when the application starts
const recover = () => {
    // Process any unprocessed docs from our input db

    // TODO insert our recovery logic here
};

// Create a meter app
const meterapp = () => {
    // Perform recovery if needed
    recover();

    // Create the Webapp
    const app = webapp();
    app.use(routes);
    app.use(router.batch(routes));
    return app;
};

// Command line interface, create the meter  app and listen
const runCLI = () => meterapp().listen();

// exports
module.exports = meterapp;
module.exports.runCLI = runCLI;
module.exports.meter = meter;
module.exports.dslformula = dslformula;
module.exports.resources = resources;
