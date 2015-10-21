'use strict';

// Resource usage schema

const schema = require('abacus-schema');

const string = schema.string;
const number = schema.number;
const time = schema.time;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const required = schema.required;

/* eslint camelcase: 1 */

// Measure schema
const measure = () => objectType('measure', {
  measure: required(string()),
  quantity: required(number())
});

// Export our public functions
const usage = () => objectType('usage', {
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

// Resource instance schema
const resourceUsage = () => objectType('resourceUsage', {
  usage: arrayOf(usage())
});

// Export our schema
module.exports = resourceUsage;
module.exports.usage = usage;
module.exports.measure = measure;

