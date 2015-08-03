'use strict';

// Service resource definition schema

const _ = require('underscore');

const schema = require('abacus-schema');

const clone = _.clone;
const extend = _.extend;

const string = schema.types.string;
const enumType = schema.types.enumType;
const object = schema.types.object;
const arrayOf = schema.types.arrayOf;

// Unit schema
const unit = object({ name: string(), quantityType: enumType(['DELTA', 'CURRENT']) }, ['name', 'quantityType']);

// Resource schema
const resource = object({ name: string(), units: arrayOf(unit) }, ['units']);

// AggregationGroup schema
const aggregationGroup = object({ name: enumType(['daily', 'monthly']) }, ['name']);

// Aggregation schema
const aggregation = object({ id: string(), unit: string(), aggregationGroup: aggregationGroup, formula: {}, accumulate: {}, aggregate: {}, rate: {} }, ['id', 'unit', 'formula']);

// Export our public functions
module.exports = () => extend(clone(object({ id: string(), resources: arrayOf(resource), aggregations: arrayOf(aggregation) }), ['id', 'resources', 'aggregations']),
    { title: 'Service Resource Definition', description : 'Defines the resources, units, metering, accumulation, aggregation and rating formulas used to meter a particular service' }
);
