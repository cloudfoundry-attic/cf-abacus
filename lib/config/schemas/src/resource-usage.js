'use strict';

// Resource usage schema

const schema = require('abacus-schema');

const string = schema.string;
const time = schema.time;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const anyType = schema.anyType;
const required = schema.required;

/* eslint camelcase: 1 */

// Measure schema
const measure = () => objectType('measure', {
  measure: required(string()),
  quantity: required(anyType('quantity'))
});

// Resource instance schema
const resourceUsage = () => objectType('resourceUsage', {
  start: required(time()),
  end: required(time()),
  region: string(),
  organization_id: required(string()),
  space_id: required(string()),
  consumer_id: string(),
  resource_id: required(string()),
  plan_id: required(string()),
  resource_instance_id: required(string()),
  measured_usage: required(arrayOf(measure()))
});

// Export our schema
module.exports = resourceUsage;
module.exports.measure = measure;

