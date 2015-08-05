'use strict';

// Provides access to service metering and aggregation configuration.

// Services are configured as individual config scripts in the services dir
const services = {
  storage: require('./services/storage.js'),
  analytics: require('./services/analytics.js')
};

// Return the list of all configured services
const all = () => services;

// Return the configuration for the specified service
const config = (sid) => all()[sid];

// Export our public functions
module.exports = config;
module.exports.all = all;
