
'use strict';

const util = require('util');

const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const request = breaker(retry(require('abacus-request')));
const debug = require('abacus-debug')('abacus-healthchecker-app-client');

const asyncGet = util.promisify(request.get);

const getApplicationHealth = async(appUri, cb) => {
  debug('Getting app %s health.', appUri);
  try {
    const response = await asyncGet(`${appUri}/healthcheck`, authHeader());
    debug('App %s returns statusCode %o', appUri, response.statusCode);
    return response.statusCode;
  } catch (e) {
    edebug('App %s returns an error %o', appUri, err);
    return httpStatus.INTERNAL_SERVER_ERROR;
  }
};

module.exports.getApplicationHealth = getApplicationHealth;
