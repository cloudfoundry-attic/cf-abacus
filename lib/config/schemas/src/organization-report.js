'use strict';

// Organization usage report schema

const schema = require('abacus-schema');

const string = schema.string;
const number = schema.number;
const time = schema.time;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const anyType = schema.anyType;
const required = schema.required;

// Common window schema
const cwindow = () => objectType('cwindow', {
  charge: required(number())
});

// Plan window schema
const pwindow = () => objectType('pwindow', {
  quantity: required(anyType('pquantity')),
  cost: required(anyType('pcost')),
  summary: required(number()),
  charge: required(number())
});

// Plan metric schema
const pmetric = () => objectType('pmetric', {
  metric: required(string()),
  windows: required(arrayOf(arrayOf(pwindow())))
});

// Plan schema
const plan = () => objectType('plan', {
  plan_id: required(string()),
  windows: required(arrayOf(arrayOf(cwindow()))),
  aggregated_usage: required(arrayOf(pmetric()))
});

// Resource window schema
const rwindow = () => objectType('rwindow', {
  quantity: required(anyType('rquantity')),
  charge: required(number())
});

// Resource metric schema
const rmetric = () => objectType('rmetric', {
  metric: required(string()),
  windows: required(arrayOf(arrayOf(rwindow())))
});

// Resource schema
const resource = () => objectType('resource', {
  resource_id: required(string()),
  windows: required(arrayOf(arrayOf(cwindow()))),
  aggregated_usage: required(arrayOf(rmetric())),
  plans: required(arrayOf(plan()))
});

// Consumer schema
const consumer = () => objectType('consumer', {
  consumer_id: required(string()),
  windows: required(arrayOf(arrayOf(cwindow()))),
  resources: required(arrayOf(resource()))
});

// Space schema
const space = () => objectType('space', {
  space_id: required(string()),
  windows: required(arrayOf(arrayOf(cwindow()))),
  resources: required(arrayOf(resource())),
  consumers: required(arrayOf(consumer()))
});

// Organization usage report schema
const organizationReport = () => objectType('organizationReport', {
  id: required(string()),
  start: required(time()),
  end: required(time()),
  processed: required(time()),
  region: string(),
  organization_id: required(string()),
  windows: required(arrayOf(arrayOf(cwindow()))),
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

