'use strict';

/**
 * abacus-auth module.
 *
 * Exposes functionality related to authentication and authorization.
 * @module abacus-auth
 */

const request = require('./lib/request');
const response = require('./lib/response');

module.exports = {
  request,
  response
};
