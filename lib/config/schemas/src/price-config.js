'use strict';

// Resource price config schema

const schema = require('abacus-schema');

const string = schema.string;
const time = schema.time;
const number = schema.number;
const arrayOf = schema.arrayOf;
const objectType = schema.objectType;
const required = schema.required;

// Price schema
const price = () => objectType('price', {
  country: required(string()),
  price: required(number())
});

// Metric schema
const metric = () => objectType('metric', {
  name: required(string()),
  prices: required(arrayOf(price()))
});

// Plan schema
const plan = () => objectType('plan', {
  plan_id: required(string()),
  metrics: required(arrayOf(metric()))
});

// Resource config schema
const priceConfig = () => objectType('priceConfig', {
  resource_id: required(string()),
  effective: required(time()),
  plans: required(arrayOf(plan()))
});

// Export our schema
module.exports = priceConfig;

