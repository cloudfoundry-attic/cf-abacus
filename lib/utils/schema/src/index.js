'use strict';

// Customized JSON Schema validator

const jsonValidator = require('is-my-json-valid');

const types = require('./types.js');

const debug = require('cf-abacus-debug')('cf-abacus-schema');

// JSON Schema validator
const validator = (schema) => {
    const v = jsonValidator(schema, {verbose: true, greedy: true});
    return (data) => {
        debug('validating %o with schema %o', data, schema);
        v(data);
        debug('validation result for %o is %o', data, v);
        return v.errors;
    };
};

// JSON Schema validator middleware
const validate = (schema) => {
    const v = validator(schema);
    return (req, res, next) => {
        const e = v(req.body);
        if (e) res.status(400).send(e);
        else next();
    };
};

// Export our public functions
module.exports.validator = validator;
module.exports.validate = validate;
module.exports.types = types;
