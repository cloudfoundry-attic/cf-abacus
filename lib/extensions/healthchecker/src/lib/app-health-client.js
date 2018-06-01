
'use strict';

const util = require('util');
const httpStatus = require('http-status-codes');

const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const request = breaker(retry(require('abacus-request')));
const debug = require('abacus-debug')('abacus-healthchecker-app-client');
const edebug = require('abacus-debug')('e-abacus-healthchecker-app-client');

const asyncGet = util.promisify(request.get);


const authHeader = (credentials) => {
  if (!credentials)
    return {};

  return {
    headers: {
      Authorization: 'Basic ' + new Buffer(`${credentials.client}:${credentials.secret}`).toString('base64')
    }
  };
};

module.exports = (credentials) => {

  const getApplicationHealth = async(appUri, cb) => {
    debug('Getting app %s health.', appUri);
    try {
      const response = await asyncGet(`${appUri}/healthcheck`, authHeader(credentials));
      debug('App %s returned statusCode %o', appUri, response.statusCode);
      return response.statusCode;
    } catch (e) {
      edebug('App %s returned an error %o', appUri, e);
      return httpStatus.INTERNAL_SERVER_ERROR;
    }
  };

  return {
    getApplicationHealth
  };
};
