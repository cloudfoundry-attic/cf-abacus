'use strict';

// Provides access to resource metering and aggregation configuration.

const _ = require('underscore');
const xeval = require('abacus-eval');

const formula = require('./formula.js');

const memoize = _.memoize;
const extend = _.extend;
const map = _.map;
const object = _.object;
const pairs = _.pairs;

const path = require('path');
const fs = require('fs');
const resourceDefinitionSchemaValidator =
      require('abacus-usage-schemas').resourceDefinition;
const debug = require('abacus-debug')('abacus-config-resources');

// Resources are configured as individual config scripts in the resources dir
const resources = {};

const loadResourceDefinition = (file) => {
  try {
    debug('Loading resource definition from file %s', file);
    let resourceDefinition = require(file);
    if(resourceDefinitionSchemaValidator.validate(resourceDefinition))
      resources[resourceDefinition.resource_id] = resourceDefinition;
    else
      debug('Invalid resource definition file %s', file);
  }
  catch(err) {
    debug('Error processing resource definition file %s, %o', file, err);
  }
};


// Load all resource definitions from the resources directory
const loadResourceDefinitions = () => {
  const resourceDefinitionsRepository = path.join(__dirname, 'resources');
  debug('Listing files in resources directory');
  const files = fs.readdirSync(resourceDefinitionsRepository);
  debug('Loading resource definitions');
  files.map(function(file) {
    loadResourceDefinition(path.join(resourceDefinitionsRepository, file));
  });
};


loadResourceDefinitions();


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
  return extend({}, resource, {
    source: resource,
    metrics: map(resource.metrics, (t) => {
      return extend({}, t, {
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
