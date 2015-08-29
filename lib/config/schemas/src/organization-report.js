'use strict';

// Organization usage report schema

const schema = require('abacus-schema');
const resourceUsage = require('./resource-usage.js');

const string = schema.string;
const time = schema.time;
const number = schema.number;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const required = schema.required;

// Metric schema
const metric = () => objectType('metric', {
  metric: required(string()),
  quantity: required(number()),
  cost: required(number())
});

// Resource schema
const resource = () => objectType('resource', {
  resource_id: required(string()),
  aggregated_usage: required(arrayOf(metric()))
});

// Consumer schema
const consumer = () => objectType('consumer', {
  consumer: required(resourceUsage.consumer()),
  resources: required(arrayOf(resource()))
});

// Space schema
const space = () => objectType('space', {
  space_id: required(string()),
  resources: required(arrayOf(resource())),
  consumers: required(arrayOf(consumer()))
});

// Organization usage report schema
const organizationReport = () => objectType('organizationReport', {
  id: required(string()),
  organization_id: required(string()),
  start: required(time()),
  end: required(time()),
  resources: required(arrayOf(resource())),
  spaces: required(arrayOf(space()))
});

// Export our schema
module.exports = organizationReport;
module.exports.metric = metric;
module.exports.resource = resource;
module.exports.consumer = consumer;
module.exports.space = space;

