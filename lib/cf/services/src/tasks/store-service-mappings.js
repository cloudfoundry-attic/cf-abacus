'use strict';

const config = require('../config');
const mappings = require('../mappings');

const debug = require('abacus-debug')('abacus-cf-services-store-service-mappings');

const servicesConfig = config.loadServicesFromEnvironment();

mappings.storeServiceMappings(servicesConfig, (err) => {
  if (err) throw new Error('Failed to store mappings');

  debug('Service mappings have been imported');
  process.exit();
});
