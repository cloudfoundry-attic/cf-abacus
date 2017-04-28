'use strict';

// JSON schema definition and validation utilities.

const _ = require('underscore');
const jsval = require('is-my-json-valid');
const lint = require('./lint.js');

const pairs = _.pairs;
const map = _.map;
const filter = _.filter;
const object = _.object;

const debug = require('abacus-debug')('abacus-schema');

// Convert a data type to a JSON schema
const schema = (t) => {
  return {
    string: (t) => ({
      type: 'string'
    }),
    number: (t) => ({
      type: 'number'
    }),
    time: (t) => ({
      type: 'integer',
      format: 'utc-millisec'
    }),
    functionString: (t) => ({
      type: 'string',
      format: 'function'
    }),
    arrayOf: (t) => ({
      type: 'array',
      minItems: t.minItems ? t.minItems : 0,
      items: schema(t.items),
      additionalItems: false
    }),
    enumType: (t) => ({
      title: t.name,
      description: t.description,
      enum: t.enum,
      default: t.default
    }),
    objectType: (t) => ({
      title: t.name,
      description: t.description,
      type: 'object',
      properties:
        object(map(pairs(t.properties), (p) => [p[0], schema(p[1])])),
      required:
        map(filter(pairs(t.properties), (p) => p[1].required), (p) => p[0]),
      additionalProperties: false
    }),
    unionType: (t) => ({
      title: t.name,
      description: t.description,
      anyOf: map(t.types, (type) => schema(type))
    }),
    anyType: (t) => ({
      title: t.name,
      description: t.description,
      anyOf: [
        {
          type: 'string'
        },
        {
          type: 'number'
        },
        {
          type: 'integer',
          format: 'utc-millisec'
        },
        {
          type: 'object'
        },
        {
          type: 'array'
        }
      ]
    })
  }[t.type](t);
};

const validateFunction = (code, eslintConfigFile, errors) => {
  if(process.env.VALIDATE_FUNCTIONS !== 'true')
    return true;
  const result = lint(code, eslintConfigFile);
  if(!result.ok)
    result.errors.forEach((error) => errors.push(error));
  return result.ok;
};

// Return a JSON Schema validator
const validator = (schema, eslintConfigFile) => {
  let errors;
  const validate = jsval(schema, {
    verbose: true,
    greedy: true,
    formats: {
      'function': (code) => validateFunction(code, eslintConfigFile, errors)
    }
  });
  return (doc) => {
    debug('validating %o with schema %o', doc, schema);

    errors = [];
    const val = validate(doc);
    debug('validation result for %o is %o - %o', doc, val, validate.errors);

    if(!val)
      throw {
        statusCode: 400,
        message: validate.errors.concat(errors)
      };

    return doc;
  };
};

// Export our public functions
module.exports = schema;
module.exports.schema = schema;
module.exports.validator = validator;

