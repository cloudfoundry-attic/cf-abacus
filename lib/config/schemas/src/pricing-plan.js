'use strict';

// Pricing plan schema

const schema = require('abacus-schema');

const string = schema.string;
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
const pricingMetric = () => objectType('metric', {
  name: required(string()),
  prices: required(arrayOf(price()))
});

// Pricing plan schema
const pricingPlan = () => objectType('pricingPlan', {
  plan_id: required(string()),
  metrics: required(arrayOf(pricingMetric()))
});

// Export our schema
module.exports = pricingPlan;

