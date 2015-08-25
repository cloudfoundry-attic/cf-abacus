'use strict';

// The data schemas we use to validate service resource definitions and
// usage data.

const schema = require('abacus-schema');

// Import our data types
const resourceDefinition = require('./resource-definition.js');
const resourceUsage = require('./resource-usage.js');

// Compile a type into a JSON schema, GraphQL schema and validate function
const compile = (type) => {
  const json = schema.json(type);
  const graphql = schema.graphql(type);
  return {
    type: type,
    json: json,
    graphql: graphql,
    validate: schema.validator(json)
  };
};

// Export the compiled types
module.exports.resourceDefinition = compile(resourceDefinition());
module.exports.resourceUsage = compile(resourceUsage());

