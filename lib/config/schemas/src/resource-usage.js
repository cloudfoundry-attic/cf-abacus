'use strict';

// Resource usage schema

const _ = require('underscore');
const schema = require('abacus-schema');

const clone = _.clone;
const extend = _.extend;

const string = schema.types.string;
const number = schema.types.number;
const time = schema.types.time;
const object = schema.types.object;
const arrayOf = schema.types.arrayOf;
const enumType = schema.types.enumType;

// Consumer schema
const consumer = object({
  type: enumType(
    ['cloud_foundry_application', 'external'], 'cloud_foundry_application'),
  value: string()
}, ['value']);

// Metric schema
const metric = object({
  name: string(),
  unit: string(),
  quantity: number()
}, ['unit', 'quantity']);

// Export our public functions
const usage = object({
    start: time(),
    end: time(),
    region: string(),
    organization_id: string(),
    space_id: string(),
    consumer: consumer,
    resource_id: string(),
    plan_id: string(),
    resource_instance_id: string(),
    metrics: arrayOf(metric)
  }, [
    'start', 'end', 'organization_id', 'space_id',
    'resource_id', 'plan_id', 'resource_instance_id', 'metrics'
  ]);

// Resource instance schema
const resourceUsage = extend(clone(object({
  usage: arrayOf(usage)
}, ['usage'])), {
  title: 'Resource Usage',
  description: 'Usage data for resource instances'
});

// Export our schema
module.exports = () => resourceUsage;

