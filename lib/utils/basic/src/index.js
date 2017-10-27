'use strict';

/**
 * abacus-basic module. 
 * 
 * Exposes functionality related to basic authentication.
 * @module abacus-basic
 */

const check = require('./check');
const credentials = require('./credentials');

module.exports = {
  check,
  credentials
};
