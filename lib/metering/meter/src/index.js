'use strict';

// Usage meter service, responsible for applying the configured metering
// functions to usage submitted by resource providers.

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
const config = require('abacus-resource-config');
const db = require('abacus-metering-db');

const map = _.map;
const extend = _.extend;
const clone = _.clone;
const omit = _.omit;
const object = _.object;

const brequest = yieldable(retry(breaker(batch(request))));

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-meter');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  accumulator: 9100
});

// Configure metered usage db
const meterdb = yieldable(retry(breaker(batch(
  db(uris.couchdb, 'abacus-metered-usage')))));

// Return a doc location given a route template and params
const loc = (req, template, params) => req.protocol + '://' +
  req.headers.host + request.route(template, params);

// Return the accumulator partition URI to post usage to
const accumuri = function *(k, t) {
  const accump = yieldable(db.partition());
  const p = yield accump(k, t, 'write');
  debug('Target accumulator partition %o', p);
  return /:partition/.test(uris.accumulator) ? request.route(uris.accumulator, {
    partition: p[0]
  }) :
    /:port/.test(uris.accumulator) ? request.route(uris.accumulator, {
      port: 9100 + p[0]
    }) : uris.accumulator;
};

// Convert measured usage to the format expected by the meter functions
// ex: [{measure: 'm1', quantity: 1}] will be mapped to [{ m1: 1}]
const measures = (mu) => {
  return object(map(mu, (m) => [m.measure, m.quantity]));
};

// Apply the configured meter functions to the given usage
const meter = (u) => {
  debug('Usage %o', u);

  // Translate the measured_usage to the measures object expected by the meter
  // function
  const ms = extend(measures(u.measured_usage), {
    start: u.start,
    end: u.end
  });

  // Apply all the meter functions to the measured usage to produce metered
  // usage
  const mu = extend(clone(u), {
    metered_usage: map(config(u.resource_id).metrics, (m) => ({
        metric: m.name,
        quantity: m.meterfn(ms)
    }))
  });

  debug('Metered usage %o', mu);
  return mu;
};

// Create an express router
const routes = router();

// Meter usage for a given resource instance
routes.post('/v1/metering/usage', throttle(function *(req) {
  debug('Received usage to be metered %o', req.body);

  // Validate the input
  if(!req.body) return {
      statusCode: 400
    };

  // Meter the usage
  const u = meter(req.body);

  // Log the metered usage
  const k = [u.organization_id, u.resource_instance_id].join('/');
  const t = seqid();
  const id = dbclient.tkuri(k, t);
  const doc = extend(clone(u), {
    id: id,
    usage_id: u.id
  });
  yield meterdb.put(doc);
  debug('Logged metered usage %o', doc);

  // Post the metered usage to the target accumulator partition
  yieldable.functioncb(brequest.post)(
    (yield accumuri(u.organization_id, t)) + '/v1/metering/metered/usage', {
      body: doc
    }, (err, res) => {
      if(err)
        debug('Failed to post %s to accumulator service, %o', id, err);
    });

  // return 201 with the usage location URL
  return {
    statusCode: 201,
    header: {
      Location: loc(req, '/v1/metering/metered/usage/:id', {
        id: id
      })
    }
  };
}));

// Retrieve a metered usage doc
routes.get(
  '/v1/metering/metered/usage/t/:t/k/:organization_id/:resource_id',
  throttle(function *(req) {
    const id = dbclient.tkuri(
      [req.params.organization_id, req.params.resource_id].join('/'),
      req.params.t);
    debug('Retrieving metered usage for id %s', id);

    // Retrieve and return the metered usage doc, and clone it without _id and
    // _rev properties
    const doc = omit(yield meterdb.get(id), ['_id', '_rev']);

    // return the doc as response body
    return {
      body: doc
    };
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

