'use strict';

const fs = require('fs');
const path = require('path');

const mappings = path.join(__dirname, 'plans');

// Maps from (resource_type, provisioning plan_id) to example plan ids
const meteringMapping = fs.readFileSync(path.join(mappings, 'metering.json'));
const pricingMapping = fs.readFileSync(path.join(mappings, 'pricing.json'));
const ratingMapping = fs.readFileSync(path.join(mappings, 'rating.json'));

module.exports.sampleMetering = JSON.parse(meteringMapping);
module.exports.samplePricing = JSON.parse(pricingMapping);
module.exports.sampleRating = JSON.parse(ratingMapping);
