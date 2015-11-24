'use strict';

const _ = require('underscore');

const extend = _.extend;

// Primitive data types
const type = (t) => ({
  type: t
});

// Core data type definitions
const string = () => type('string');
const number = () => type('number');
const time = () => type('time');

const enumType = (name, e, def, description) => ({
  type: 'enumType',
  name: name,
  enum: e,
  default: def,
  description: description
});

const objectType = (name, properties, description) => ({
  type: 'objectType',
  name: name,
  properties: properties,
  description: description
});

const arrayOf = (items, minItems) => ({
  type: 'arrayOf',
  minItems: minItems ? minItems : 0,
  items: items
});

const required = (t) => extend({}, t, {
  required: true
});

// Export primitive data types
module.exports.string = string;
module.exports.number = number;
module.exports.time = time;
module.exports.enumType = enumType;
module.exports.objectType = objectType;
module.exports.arrayOf = arrayOf;
module.exports.required = required;

