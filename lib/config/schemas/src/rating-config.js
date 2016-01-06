'use strict';

// Rating config schema

const schema = require('abacus-schema');

const string = schema.string;
const time = schema.time;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const required = schema.required;

/* eslint no-eval: 1 */
/* jshint evil: true */

// Metric schema
const metric = () => objectType('metric', {
  name: required(string()),
  unit: required(string()),
  rate: string(),
  charge: string()
});

// Plan schema
const plan = () => objectType('plan', {
  rating_plan_id: required(string()),
  metrics: required(arrayOf(metric()))
});

// Resource config schema
const ratingConfig = () => objectType('resourceConfig', {
  resource_id: required(string()),
  effective: required(time()),
  rating_plans: required(arrayOf(plan()))
});

// Export our schema
module.exports = ratingConfig;
module.exports.metric = metric;

