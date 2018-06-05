
'use strict';
const httpStatus = require('http-status-codes');
const util = require('util');

const request = require('abacus-request');
const debug = require('abacus-debug')('abacus-healthchecker-app-client');
const edebug = require('abacus-debug')('e-abacus-healthchecker-app-client');

const asyncGet = util.promisify(request.get);

const base64EncodedCredentials = (credentials) => {
  return new Buffer(`${credentials.client}:${credentials.secret}`).toString('base64');
};

const authHeader = (credentials) => {
  if (!credentials)
    return {};

  return {
    headers: {
      Authorization: 'Basic ' + base64EncodedCredentials(credentials)
    }
  };
};

module.exports = (credentials) => {

  const getApplicationHealth = async(appUri) => {
    debug('Getting app %s health.', appUri);
    try {
      const response = await asyncGet(`${appUri}/healthcheck`, authHeader(credentials));
      debug('App %s returned statusCode %o', appUri, response.statusCode);
      return response.statusCode;
    } catch (err) {
      edebug('App %s returned an error %o', appUri, err);
      if (err.statusCode)
        return err.statusCode;
        
      return httpStatus.INTERNAL_SERVER_ERROR;
    }
  };

  return {
    getApplicationHealth
  };
};
