'use strict';

// Resource config schema

const schema = require('abacus-schema');

const string = schema.string;
const time = schema.time;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const required = schema.required;

/* eslint no-eval: 1 */
/* jshint evil: true */

// Measure schema
const measure = () => objectType('measure', {
  name: required(string()),
  unit: required(string())
});

// Metric schema
const metric = () => objectType('metric', {
  name: required(string()),
  unit: required(string()),
  // Formulas are deprecated, we're now using Javascript metering and
  // aggregation functions instead
  formula: string(),
  meter: string(),
  accumulate: string(),
  aggregate: string(),
  rate: string(),
  summarize: string(),
  charge: string()
});

// Resource config schema
const resourceConfig = () => objectType('resourceConfig', {
  resource_id: required(string()),
  effective: required(time()),
  measures: required(arrayOf(measure())),
  metrics: required(arrayOf(metric()))
});

// Export our schema
module.exports = resourceConfig;
module.exports.measure = measure;
module.exports.metric = metric;

