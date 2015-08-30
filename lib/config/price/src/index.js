'use strict';

// Provides access to resource pricing configuration.

// Prices are configured as individual config scripts in the resources dir
const resources = {
  'object-storage': require('./resources/storage.js')
};

// Return the list of all resource prices
const all = () => resources;

// Return the price for the specified resource
const config = (rid) => all()[rid];

// Export our public functions
module.exports = config;
module.exports.all = all;

