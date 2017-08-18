'use strict';

const debug = require('abacus-debug')('abacus-cf-services');

const storeServiceMappings = require('..').storeServiceMappings;

storeServiceMappings((err) => {
  if(err)
    throw new Error('Failed to store mappings');

  debug('Service mappings have been imported');
  process.exit();
});
