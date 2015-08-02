'use strict';

// The JSON schemas we use to validate service resource definitions and usage data.

const schema = require('cf-abacus-schema');

// Return a function that will validate a doc with the given schema
const validate = (s) => {
    const v = schema.validator(s);
    return (doc) => {
        const e = v(doc);
        if(e) {
            e.statusCode = 400;
            throw e;
        }
        return doc;
    };
};

// Import our various schemas and creation validate functions for them
const serviceDefinition = require('./service-definition.js');
serviceDefinition.validate = validate(serviceDefinition());

const serviceUsage = require('./service-usage.js');
serviceUsage.validate = validate(serviceUsage());

const serviceInstanceUsage = require('./service-instance-usage.js');
serviceInstanceUsage.validate = validate(serviceInstanceUsage());

const runtimeUsage = require('./runtime-usage.js');
runtimeUsage.validate = validate(runtimeUsage());

// Export the schemas
module.exports.serviceDefinition = serviceDefinition;

module.exports.serviceUsage = serviceUsage;
module.exports.serviceInstanceUsage = serviceInstanceUsage;
module.exports.runtimeUsage = runtimeUsage;
