'use strict';

// Provides access to resource metering and aggregation configuration.

const _ = require('underscore');
const xeval = require('abacus-eval');

const formula = require('./formula.js');

const memoize = _.memoize;
const clone = _.clone;
const extend = _.extend;
const map = _.map;
const object = _.object;
const pairs = _.pairs;

// Resources are configured as individual config scripts in the resources dir
const resources = {
  // A sample object storage resource using discrete metering
  'object-storage': require('./resources/storage.js'),

  // A sample container service using time based metering
  'linux-container': require('./resources/container.js'),

  // This service uses deprecated metering formulas, keeping it for now to
  // show how they were used as they're still supported, although deprecated
  'analytics': require('./resources/analytics.js'),

  // A test resource that combines discrete and time based metering
  'test-resource': require('./resources/test.js')
};

// Default metering and aggregation functions
const meter = (name) => (m) => m[name];
const accumulate = (a, qty) => (a || 0) + qty;
const aggregate = (a, prev, curr) => (a || 0) + curr - prev;
const rate = (p, qty) => (p || 0) * qty;
const charge = (t, cost) => cost;
const summarize = (t, qty) => qty;

// Return the meter function for a given metric
const meterfn = (t) => t.meter ? xeval(t.meter) :
  t.formula ? formula.meterfn(t.formula) : meter(t.name);

// Return the accumulation function for a given metric
const accumulatefn = (t) => t.accumulate ? xeval(t.accumulate) :
  t.formula ? formula.accumfn(t.formula) : accumulate;

// Return the aggregation function for a given metric
const aggregatefn = (t) => t.aggregate ? xeval(t.aggregate) : aggregate;

// Return the rating function for a given metric
const ratefn = (t) => t.rate ? xeval(t.rate) : rate;

// Return the charge function for a given metric
const chargefn = (t) => t.charge ? xeval(t.charge) : charge;

// Return the summary function for a given metric
const summarizefn = (t) => t.summarize ? xeval(t.summarize) : summarize;

// Compile the functions configured in a resource
const compile = (resource) => {
  return extend(clone(resource), {
    source: resource,
    metrics: map(resource.metrics, (t) => {
      return extend(clone(t), {
        meterfn: meterfn(t),
        accumulatefn: accumulatefn(t),
        aggregatefn: aggregatefn(t),
        ratefn: ratefn(t),
        chargefn: chargefn(t),
        summarizefn: summarizefn(t)
      });
    })
  });
};

// Return the list of all configured resources
const all = memoize(() => object(
  map(pairs(resources), (r) => [r[0], compile(r[1])])));

// Return the configuration for the specified resource
const config = (rid) => all()[rid];

// Export our public functions
module.exports = config;
module.exports.all = all;

