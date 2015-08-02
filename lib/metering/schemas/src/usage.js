'use strict';

// Usage  schema

const types = require('./types.js');

const string = types.string;
const number = types.number;
const time = types.time;

const enumType = types.enumType;
const object = types.object;
const arrayOf = types.arrayOf;

// Consumer schema
const consumer = object({ type: enumType(['cloud_foundry_application', 'external'], 'cloud_foundry_application'), value: string() }, ['value']);

// Resource schema
const resource = types.object({ name: string(), unit: string(), quantity: number() }, ['unit', 'quantity']);

// Export our public functions
module.exports = () => object({ start: time(), end: time(), plan_id: string(), region: string(), organization_guid:  string(), space_guid: string(),
    consumer: consumer, resources: arrayOf(resource) }, ['start', 'end', 'plan_id', 'organization_guid', 'space_guid', 'resources']);
