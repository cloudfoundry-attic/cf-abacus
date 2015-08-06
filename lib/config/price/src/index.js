'use strict';

// Provides access to service pricing configuration.

// Prices are configured as individual config scripts in the services dir
const services = {
  storage: require('./services/storage.js')
};

// Return the list of all service prices
const all = () => services;

// Return the price for the specified service
const config = (sid) => all()[sid];

// Export our public functions
module.exports = config;
module.exports.all = all;

