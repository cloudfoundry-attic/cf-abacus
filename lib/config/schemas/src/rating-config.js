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
  rate: string(),
  charge: string()
});

// Rating config schema
const ratingConfig = () => objectType('resourceConfig', {
  rating_plan_id: required(string()),
  effective: required(time()),
  metrics: required(arrayOf(metric()))
});

// Export our schema
module.exports = ratingConfig;
module.exports.metric = metric;
