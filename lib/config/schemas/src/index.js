'use strict';

// The data schemas we use to validate service resource definitions and
// usage data.

const schema = require('abacus-schema');

// Import our data types
const resourceConfig = require('./resource-config.js');
const priceConfig = require('./price-config.js');
const resourceUsage = require('./resource-usage.js');
const organizationReport = require('./organization-report.js');

// Compile a type into a JSON schema, GraphQL schema and validate function
const compile = (type) => {
  const json = schema.json(type);
  const graph = schema.graph(type);
  return {
    type: () => type,
    json: () => json,
    graph: () => graph,
    validate: schema.validator(json)
  };
};

// Export the compiled types
module.exports.resourceConfig = compile(resourceConfig());
module.exports.priceConfig = compile(priceConfig());
module.exports.resourceUsage = compile(resourceUsage());
module.exports.organizationReport = compile(organizationReport());

