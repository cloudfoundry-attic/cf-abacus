// A simple wrapper to retrieve CF OAuth token
// Supports the following environment variables
//  API_HOST_NAME - Cloud Foundry api host
//  TOKEN_ENDPOINT - URL to get tokens (can be looked up using API_HOST_NAME)
//  CLIENT_ID - client credentials
//  CLIENT_SECRET - client credentials

'use strict';

const debug = require('abacus-debug')('abacus-oauth');
const url = require('url');
const request = require('abacus-request');
const retry = require('abacus-retry');
const _ = require('underscore');

const clone = _.clone;
const extend = _.extend;

const get = retry(request.get);

// Retrieve token endpoint from the CF API endpoint
const tokenEndpoint = (apiHostName, cb) => {
  debug('Retrieving oauth server');
  get('http://' + (apiHostName ? apiHostName : process.env.API_HOST_NAME) +
    '/v2/info',
    (error, response) => {
      if (error) {
        debug('Error oauth server %o', error);
        cb(error);
      }
      if (response.statusCode >= 400) {
        debug('%s - %s - has returned an error - response %d' +
          (response.body ? ' %o' : '%s'), response.request.method,
          response.request.path, response.statusCode,
          response.body ? response.body : '');
        cb(new Error('Unable  to get oauth server information'));
      }
      debug('Retrieved %o', response.body.token_endpoint);

      // Return endpoint host
      cb(null, url.parse(response.body.token_endpoint).hostname);
    }
  );
};

// Retrieve token from the endpoint using client credentials
// OAuth trusted client flow.
// The tokenInfo object is augmented with the token expiry time
const newToken = (tokenEndpoint, clientId, secret, scopes, cb) => {

  debug('Retrieving token info');
  get('http://' +
    (tokenEndpoint ? tokenEndpoint : process.env.TOKEN_ENDPOINT) +
    '/oauth/token?grant_type=client_credentials' +
    (scopes ? '&scope=' + encodeURIComponent(scopes) : ''),
    {
      headers: {
        authorization: 'Basic ' + new Buffer(
          (clientId ? clientId : process.env.CLIENT_ID) + ':' +
          (secret ? secret : process.env.CLIENT_SECRET)
        ).toString('base64')
      }
    }, (error, response) => {
      if (error) {
        debug('Error getting token : %o', error);
        cb(error);
      }
      if (response.statusCode >= 400) {
        debug('Error getting token, response %s, error %o', response.statusCode,
          response.body ? response.body : '');
        cb(new Error('Unable to get OAUTH token'));
      }
      const tokenInfo = response.body;
      cb(null, extend(clone(tokenInfo), {
        expiry: Date.now() + tokenInfo.expires_in * 1000}));
    });
};

module.exports.tokenEndpoint = tokenEndpoint;
module.exports.newToken = newToken;
