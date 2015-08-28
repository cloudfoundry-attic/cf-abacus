'use strict';

// Usage report schema

const schema = require('abacus-schema');
const resourceUsage = require('./resource-usage.js');

const string = schema.string;
const time = schema.time;
const number = schema.number;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const required = schema.required;

const args = (t, a) => t;

// Metric schema
const metric = () => objectType('metric', {
  name: string(),
  unit: required(string()),
  quantity: required(number()),
  cost: required(number())
});

// Resource schema
const resource = () => objectType('resource', {
  resource_id: required(string()),
  metrics: required(arrayOf(metric()))
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

// Organization schema
const organization = () => objectType('organization', {
  organization_id: required(string()),
  start: required(time()),
  end: required(time()),
  resources: required(arrayOf(resource())),
  spaces: required(arrayOf(space()))
});

// Report schema
const usageReport = () => objectType('usageReport', {
  organization: args(organization(), {
    organization_id: required(string()),
    date: required(string())
  }),
  organizations: args(arrayOf(organization()), {
    organization_ids: required(arrayOf(string())),
    date: required(string())
  }),
  account: args(arrayOf(organization()), {
    account_id: required(string()),
    date: required(string())
  })
});

// Export our schema
module.exports = usageReport;
module.exports.metric = metric;
module.exports.resource = resource;
module.exports.consumer = consumer;
module.exports.space = space;
module.exports.organization = organization;

