'use strict';

// Resource usage schema

const schema = require('abacus-schema');

const string = schema.string;
const number = schema.number;
const time = schema.time;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const enumType = schema.enumType;
const required = schema.required;

/* eslint camelcase: 1 */

// Consumer schema
const consumer = () => objectType('consumer', {
  type: enumType('consumerType',
    ['CF_APP', 'EXTERNAL'], 'CF_APP'),
  consumer_id: required(string())
});

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
  consumer: consumer(),
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
module.exports.consumer = consumer;
module.exports.measure = measure;

