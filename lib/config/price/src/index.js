'use strict';
const path = require('path');
const fs = require('fs');

const debug = require('abacus-debug')('abacus-config-resources');

// Provides access to resource pricing configuration.
// Prices are configured as individual config scripts in the resources dir
const resources = {};

const loadPriceDefinition = (file) => {
  try {
    debug('Loading price definition from file %s', file);
    let priceDefinition = require(file);
    debug(priceDefinition);
    if(priceDefinition && priceDefinition.resource_id)
      resources[priceDefinition.resource_id] = priceDefinition;
    else
      debug('Invalid price definition file %s', file);
  }
  catch(err) {
    debug('Error processing price definition file %s, %o', file, err);
  }
};


// Load all price definitions from the resources directory
const loadPriceDefinitions = () => {
  const priceDefinitionsRepository = path.join(__dirname, 'resources');
  debug('Listing files in resources directory');
  const files = fs.readdirSync(priceDefinitionsRepository);
  debug('Loading price definitions');
  files.map(function(file) {
    loadPriceDefinition(path.join(priceDefinitionsRepository, file));
  });
};


loadPriceDefinitions();

// Return the list of all resource prices
const all = () => resources;

// Return the price for the specified resource
const config = (rid) => all()[rid];

// Export our public functions
module.exports = config;
module.exports.all = all;
