'use strict';

// Primitive data types based on JSON Schema

const type = (t) => ({
    type: t
});
const formatedType = (t, f) => ({
    type: t,
    format: f
});

// Primitive data type descriptions

const string = () => type('string');
const number = () => type('number');
const time = () => formatedType('integer', 'utc-millisec');

const enumType = (e, def) => ({
    enum: e,
    default: def
});
const object = (properties, required) => ({
    type: 'object',
    required: required ? required : [],
    properties: properties,
    additionalProperties: false
});
const arrayOf = (items, minItems) => ({
    type: 'array',
    minItems: minItems ? minItems : 1,
    items: items,
    additionalItems: false
});

// Export primitive data types
module.exports.string = string;
module.exports.number = number;
module.exports.time = time;
module.exports.enumType = enumType;
module.exports.object = object;
module.exports.arrayOf = arrayOf;

