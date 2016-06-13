'use strict';

// Metering plan schema

const schema = require('abacus-schema');

const string = schema.string;
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
  type: required(string()),
  // Formulas are deprecated, we're now using Javascript metering and
  // aggregation functions instead
  formula: string(),
  meter: string(),
  accumulate: string(),
  aggregate: string(),
  summarize: string()
});

// Plan schema
const meteringPlan = () => objectType('meteringPlan', {
  plan_id: required(string()),
  measures: required(arrayOf(measure())),
  metrics: required(arrayOf(metric()))
});

// Export our schema
module.exports = meteringPlan;
module.exports.measure = measure;
module.exports.metric = metric;

