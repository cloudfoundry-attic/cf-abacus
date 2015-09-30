'use strict';

// A wrapper to retrieve, validate and decode CF OAuth token
// Needs following environment variables
//  API_HOST_NAME - Cloud Foundry api host
//  TOKEN_ENDPOINT - URL to get tokens (can be looked up using API_HOST_NAME)
//  CLIENT_ID - client credentials
//  CLIENT_SECRET - client credentials

const url = require('url');
const _ = require('underscore');
const jwt = require('jsonwebtoken');
const request = require('abacus-request');
const retry = require('abacus-retry');

const extend = _.extend;

const debug = require('abacus-debug')('abacus-oauth');

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
      cb(null, extend({}, tokenInfo, {
        expiry: Date.now() + tokenInfo.expires_in * 1000
      }));
    });
};

// Decode token and return its JSON representation.
// The complete token, including header and signature is returned
const decode = (token) => {
  return jwt.decode(token, {
    complete: true
  });
};

// Retrieve the scope array from the token
const getScope = (token) => {
  return decode(token).payload.scope;
};

// Retrieve pair of properties describing user: user_id and user_name
// Valid for grant type password
const getUserInfo = (token) => {
  const decoded = decode(token);

  return decoded.payload.grant_type === 'password' ? {
    user_id: decoded.payload.user_id,
    user_name: decoded.payload.user_name
  } : new Error('Incorrect token type');
};

// Validate token signature with the given secret and algorithm.
// It is an error not to provide algorithm as the one specified in the
// token cannot be trusted
// Returns decoded token
const validate = (token, secret, algorithm, cb) => {
  try {
    const decoded = jwt.verify(token,
      secret ? secret : process.env.TOKEN_SECRET, {
        algorithms: [algorithm ? algorithm : process.env.TOKEN_ALGORITHM]
      });

    debug('Token validated successfully');
    cb(null, decoded);
  }
  catch (error) {
    debug('Token validation failed %o', error);
    cb(error);
  }
};

// Return an Express middleware that verifies an oauth bearer access token
const validator = (secret, algorithm) => {
  return (req, res, next) => {
    // Check authoriation header field for a bearer access token
    // then verfify the access token using jwt
    if (req.headers.authorization &&
      /^bearer /i.test(req.headers.authorization))
      validate(req.headers.authorization.replace(/^bearer /i, ''),
        secret, algorithm, (err, val) => {
          if (err)
            return res.status(401).header('WWW-Authenticate',
              'Bearer realm="cf",' +
              ' error="invalid_token",' +
              ' error_description="' + err.message + '"').end();

          // has a valid token, so proceed to process the request
          return next();
        });
    else
      return res.status(401).header('WWW-Authenticate',
        'Bearer realm="cf"').end();
  };
};

module.exports.tokenEndpoint = tokenEndpoint;
module.exports.newToken = newToken;
module.exports.decode = decode;
module.exports.validate = validate;
module.exports.validator = validator;
module.exports.getScope = getScope;
module.exports.getUserInfo = getUserInfo;
