'use strict';

// Usage schema

const schema = require('abacus-schema');

const string = schema.types.string;
const number = schema.types.number;
const time = schema.types.time;

const enumType = schema.types.enumType;
const object = schema.types.object;
const arrayOf = schema.types.arrayOf;

// Consumer schema
const consumer = object({
  type: enumType(
    ['cloud_foundry_application', 'external'], 'cloud_foundry_application'),
  value: string()
}, ['value']);

// Resource schema
const resource = object({
  name: string(),
  unit: string(),
  quantity: number()
}, ['unit', 'quantity']);

// Export our public functions
module.exports = () => object({
    start: time(),
    end: time(),
    plan_id: string(),
    region: string(),
    organization_guid: string(),
    space_guid: string(),
    consumer: consumer,
    resources: arrayOf(resource)
  }, [
    'start', 'end', 'plan_id', 'organization_guid', 'space_guid', 'resources'
  ]);

