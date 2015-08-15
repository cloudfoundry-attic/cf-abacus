'use strict';

// Provides access to resource metering and aggregation configuration.

// Resources are configured as individual config scripts in the resources dir
const resources = {
  storage: require('./resources/storage.js'),
  analytics: require('./resources/analytics.js')
};

// Return the list of all configured resources
const all = () => resources;

// Return the configuration for the specified resource
const config = (rid) => all()[rid];

// Export our public functions
module.exports = config;
module.exports.all = all;

