'use strict';

// The JSON schemas we use to validate service resource definitions and
// usage data.

const schema = require('abacus-schema');

const validator = schema.validator;

// Import our various schemas and creation validate functions for them
const serviceDefinition = require('./service-definition.js');
serviceDefinition.validate = validator(serviceDefinition());

const serviceUsage = require('./service-usage.js');
serviceUsage.validate = validator(serviceUsage());

const serviceInstanceUsage = require('./service-instance-usage.js');
serviceInstanceUsage.validate = validator(serviceInstanceUsage());

const runtimeUsage = require('./runtime-usage.js');
runtimeUsage.validate = validator(runtimeUsage());

// Export the schemas
module.exports.serviceDefinition = serviceDefinition;

module.exports.serviceUsage = serviceUsage;
module.exports.serviceInstanceUsage = serviceInstanceUsage;
module.exports.runtimeUsage = runtimeUsage;
