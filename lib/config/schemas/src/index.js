'use strict';

// The data schemas we use to validate service resource definitions and
// usage data.

const schema = require('abacus-schema');

// Import our data types
const meteringConfig = require('./metering-config.js');
const pricingConfig = require('./pricing-config.js');
const resourceUsage = require('./resource-usage.js');
const organizationReport = require('./organization-report.js');
const ratingConfig = require('./rating-config.js');
const resourceInstanceReport = require('./resource-instance-report.js');

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
module.exports.meteringConfig = compile(meteringConfig());
module.exports.pricingConfig = compile(pricingConfig());
module.exports.resourceUsage = compile(resourceUsage());
module.exports.organizationReport = compile(organizationReport());
module.exports.ratingConfig = compile(ratingConfig());
module.exports.resourceInstanceReport = compile(resourceInstanceReport());

