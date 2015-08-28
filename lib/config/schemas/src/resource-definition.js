'use strict';

// Resource definition schema

const schema = require('abacus-schema');

const string = schema.string;
const arrayOf = schema.arrayOf;
const enumType = schema.enumType;
const objectType = schema.objectType;
const required = schema.required;

/* eslint no-eval: 1 */
/* jshint evil: true */

// Unit schema
const unit = () => objectType('unit', {
  name: required(string()),
  quantityType: required(enumType('quantityType', ['DELTA', 'CURRENT']))
});

// Metric schema
const metric = () => objectType('metric', {
  name: string(),
  units: required(arrayOf(unit()))
});

// AggregationGroup schema
const aggregationGroup = () => objectType('aggregationGroup', {
  name: required(enumType('name', ['DAILY', 'MONTHLY']))
});

// Transform schema
const transform = () => objectType('transform', {
  id: required(string()),
  unit: required(string()),
  aggregationGroup: aggregationGroup(),
  // Formulas are deprecated, we're now using meter, accumulate, aggregate and
  // rate Javascript functions instead
  formula: string(),
  meter: string(),
  accumulate: string(),
  aggregate: string(),
  rate: string(),
  report: string()
});

// Resource definition schema
const resourceDefinition = () => objectType('resourceDefinition', {
  id: required(string()),
  metrics: required(arrayOf(metric())),
  transforms: required(arrayOf(transform()))
});

// Export our schema
module.exports = resourceDefinition;
module.exports.unit = unit;
module.exports.metric = metric;
module.exports.aggregationGroup = aggregationGroup;
module.exports.transform = transform;

