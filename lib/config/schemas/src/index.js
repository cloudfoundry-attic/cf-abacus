'use strict';

// The data schemas we use to validate metering and rating plans and usage
// data.

const schema = require('abacus-schema');

// Import our data types
const meteringPlan = require('./metering-plan.js');
const pricingPlan = require('./pricing-plan.js');
const resourceUsage = require('./resource-usage.js');
const organizationReport = require('./organization-report.js');
const ratingPlan = require('./rating-plan.js');
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
module.exports.meteringPlan = compile(meteringPlan());
module.exports.pricingPlan = compile(pricingPlan());
module.exports.resourceUsage = compile(resourceUsage());
module.exports.organizationReport = compile(organizationReport());
module.exports.ratingPlan = compile(ratingPlan());
module.exports.resourceInstanceReport = compile(resourceInstanceReport());

