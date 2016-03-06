'use strict';

// Resource instance usage report schema

const schema = require('abacus-schema');

const string = schema.string;
const time = schema.time;
const number = schema.number;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const anyType = schema.anyType;
const required = schema.required;

const windows = () => objectType('windows', {
  quantity: required(anyType('quantity')),
  cost: required(anyType('cost')),
  summary: required(number()),
  charge: required(number())
});

const accumulated = () => objectType('accumulated_usage', {
  metric: required(string()),
  windows: required(arrayOf(arrayOf(windows())))
});

const cwindows = () => objectType('cwindows', {
  charge: required(number())
});

// Resource Instance usage report schema
const resourceInstanceReport = () => objectType('resourceInstanceReport', {
  id: required(string()),
  start: required(time()),
  end: required(time()),
  processed: required(time()),
  organization_id: required(string()),
  space_id: required(string()),
  resource_id: required(string()),
  resource_instance_id: required(string()),
  plan_id: required(string()),
  metering_plan_id: required(string()),
  ratinging_plan_id: required(string()),
  pricing_plan_id: required(string()),
  consumer_id: string(),
  accumulated_usage: required(arrayOf(accumulated())),
  windows: required(arrayOf(arrayOf(cwindows())))
});

// Export our schema
module.exports = resourceInstanceReport;
module.exports.accumulated = accumulated;
module.exports.windows = windows;
