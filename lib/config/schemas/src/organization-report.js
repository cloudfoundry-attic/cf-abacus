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

// Plan metric schema
const pmetric = () => objectType('pmetric', {
  metric: required(string()),
  quantity: required(number()),
  cost: required(number()),
  summary: required(number()),
  charge: required(number())
});

// Plan schema
const plan = () => objectType('plan', {
  plan_id: required(string()),
  charge: required(number()),
  aggregated_usage: required(arrayOf(pmetric()))
});

// Resource metric schema
const rmetric = () => objectType('rmetric', {
  metric: required(string()),
  quantity: required(number()),
  summary: required(number()),
  charge: required(number())
});

// Resource schema
const resource = () => objectType('resource', {
  resource_id: required(string()),
  charge: required(number()),
  aggregated_usage: required(arrayOf(rmetric())),
  plans: required(arrayOf(plan()))
});

// Consumer schema
const consumer = () => objectType('consumer', {
  consumer: required(resourceUsage.consumer()),
  charge: required(number()),
  resources: required(arrayOf(resource()))
});

// Space schema
const space = () => objectType('space', {
  space_id: required(string()),
  charge: required(number()),
  resources: required(arrayOf(resource())),
  consumers: required(arrayOf(consumer()))
});

// Organization usage report schema
const organizationReport = () => objectType('organizationReport', {
  id: required(string()),
  organization_id: required(string()),
  start: required(time()),
  end: required(time()),
  charge: required(number()),
  resources: required(arrayOf(resource())),
  spaces: required(arrayOf(space()))
});

// Export our schema
module.exports = organizationReport;
module.exports.pmetric = pmetric;
module.exports.plan = plan;
module.exports.rmetric = rmetric;
module.exports.resource = resource;
module.exports.consumer = consumer;
module.exports.space = space;

