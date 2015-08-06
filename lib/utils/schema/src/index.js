'use strict';

// Customized JSON Schema validator

const jsonValidator = require('is-my-json-valid');

const types = require('./types.js');

const debug = require('abacus-debug')('abacus-schema');

// JSON Schema validator
const validator = (schema) => {
  const validate = jsonValidator(schema, {
    verbose: true,
    greedy: true
  });
  return (doc) => {
    debug('validating %o with schema %o', doc, schema);

    const isValid = validate(doc);
    debug('validation result for %o is %o - %o', doc, isValid, validate.errors);

    if(!isValid)
      throw {
        statusCode: 400,
        message: validate.errors
      };

    return doc;
  };
};

// JSON Schema validator middleware
const middleware = (schema) => {
  const validate = validator(schema);
  return (req, res, next) => {
    try {
      validate(req.body);
      next();
    }
    catch (error) {
      res.status(error.statusCode).send(error.message);
    }
  };
};

// Export our public functions
module.exports.validator = validator;
module.exports.validator.middleware = middleware;
module.exports.types = types;

