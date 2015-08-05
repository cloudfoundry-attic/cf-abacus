'use strict';

// Service instance usage schema

const _ = require('underscore');

const schema = require('abacus-schema');
const usage = require('./usage.js');

const clone = _.clone;
const extend = _.extend;

const string = schema.types.string;
const object = schema.types.object;
const arrayOf = schema.types.arrayOf;

// Export our public functions
module.exports = () => extend(clone(object({
  service_id: string(),
  usage: arrayOf(usage())
}, ['service_id', 'usage'])),
{
  title: 'Service Instance Usage',
  description: 'Usage records for a service instance'
});
