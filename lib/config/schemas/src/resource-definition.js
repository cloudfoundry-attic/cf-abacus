'use strict';

// Resource definition schema

const _ = require('underscore');

const schema = require('abacus-schema');

const clone = _.clone;
const extend = _.extend;

const string = schema.types.string;
const enumType = schema.types.enumType;
const object = schema.types.object;
const arrayOf = schema.types.arrayOf;

// Unit schema
const unit = object({
  name: string(),
  quantityType: enumType(['DELTA', 'CURRENT'])
}, ['name', 'quantityType']);

// Metric schema
const metric = object({
  name: string(),
  units: arrayOf(unit)
}, ['units']);

// AggregationGroup schema
const aggregationGroup = object({
  name: enumType(['daily', 'monthly'])
}, ['name']);

// Transform schema
const transform = object({
  id: string(),
  unit: string(),
  aggregationGroup: aggregationGroup,
  meter: {},
  accumulate: {},
  aggregate: {},
  rate: {}
}, ['id', 'unit', 'meter']);

// Resource definition schema
const resourceDefinition = extend(clone(object({
  id: string(),
  metrics: arrayOf(metric),
  transforms: arrayOf(transform)
}, ['id', 'metrics', 'transforms'])), {
  title: 'Resource Definition',
  description: 'Defines the metrics, units, metering, accumulation, ' +
    'aggregation and rating formulas used to meter a particular resource'
});

// Export our schema
module.exports = () => resourceDefinition;

