'use strict';

// The JSON schemas we use to validate service resource definitions and
// usage data.

const schema = require('abacus-schema');

const validator = schema.validator;

// Import our various schemas and validate functions for them
const resourceDefinition = require('./resource-definition.js');
resourceDefinition.validate = validator(resourceDefinition());

const resourceUsage = require('./resource-usage.js');
resourceUsage.validate = validator(resourceUsage());

// Export the schemas
module.exports.resourceDefinition = resourceDefinition;
module.exports.resourceUsage = resourceUsage;

