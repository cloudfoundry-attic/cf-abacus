'use strict';

// Resource usage schema

const _ = require('underscore');
const schema = require('abacus-schema');
const resources = require('abacus-resource-config');

const keys = _.keys;

const string = schema.string;
const number = schema.number;
const time = schema.time;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const enumType = schema.enumType;
const required = schema.required;

/* eslint camelcase: 1 */

// Configured resource ids
const resource_ids = keys(resources.all());

// Consumer schema
const consumer = () => objectType('consumer', {
  type: enumType('consumerType',
    ['CF_APP', 'EXTERNAL'], 'CF_APP'),
  consumer_id: required(string())
});

// Metric schema
const metric = () => objectType('metric', {
  name: string(),
  unit: required(string()),
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
  resource_id: required(enumType('resource_id', resource_ids)),
  plan_id: required(string()),
  resource_instance_id: required(string()),
  metrics: required(arrayOf(metric()))
});

// Resource instance schema
const resourceUsage = () => objectType('resourceUsage', {
  usage: arrayOf(usage())
});

// Export our schema
module.exports = resourceUsage;
module.exports.usage = usage;
module.exports.consumer = consumer;
module.exports.metric = metric;

