'use strict';

const debug = require('abacus-debug')('abacus-provisioning-plugin');
const mappings = require('abacus-plan-mappings');

mappings.storeDefaultMappings(() => {
  debug('Default mappings have been imported');
  process.exit();
});
