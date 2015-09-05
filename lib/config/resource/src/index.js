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
  'analytics': require('./resources/analytics.js'),
  'object-storage': require('./resources/storage.js')
};

// Default metering and aggregation functions
const prop = (name) => (m) => m[name];
const sum = (a, qty) => a ? a + qty : qty;
const zero = (p, qty) => 0;
const identity = (t, cost) => cost;

// Return the meter function for a given metric
const meterfn = (t) => t.meter ? xeval(t.meter) :
  t.formula ? formula.meterfn(t.formula) : prop(t.name);

// Return the accumulation function for a given metric
const accumulatefn = (t) => t.accumulate ? xeval(t.accumulate) :
  t.formula ? formula.accumfn(t.formula) : sum;

// Return the aggregation function for a given metric
const aggregatefn = (t) => t.aggregate ? xeval(t.aggregate) : sum;

// Return the rating function for a given metric
const ratefn = (t) => t.rate ? xeval(t.rate) : zero;

// Return the charge function for a given metric
const chargefn = (t) => t.charge ? xeval(t.charge) : identity;

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
        chargefn: chargefn(t)
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

