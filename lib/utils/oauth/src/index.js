'use strict';

// A wrapper to retrieve, validate and decode CF OAuth token

const _ = require('underscore');
const jwt = require('jsonwebtoken');
const request = require('abacus-request');
const retry = require('abacus-retry');

const isEmpty = _.isEmpty;
const pick = _.pick;
const intersection = _.intersection;
const difference = _.difference;

const debug = require('abacus-debug')('abacus-oauth');
const edebug = require('abacus-debug')('e-abacus-oauth');

const get = retry(request.get);

// Retrieve token from the endpoint using client credentials
// OAuth trusted client flow.
const newToken = (tokenEndpoint, clientId, secret, scopes, cb) => {
  debug('Retrieving token from endpoint %o with client %s and scopes %s',
    tokenEndpoint, clientId, scopes);

  get(`${tokenEndpoint}/oauth/token?grant_type=client_credentials` +
    (scopes ? '&scope=' + encodeURIComponent(scopes) : ''),
    {
      headers: {
        authorization: 'Basic ' + new Buffer(clientId + ':' + secret)
          .toString('base64')
      }
    }, (err, val) => {
      if (err) {
        debug('Error getting token : %o', err);
        cb(err);
        return;
      }

      if (val.statusCode >= 400) {
        debug('Error getting token, response %s, error %o', val.statusCode,
          val.body || '');
        cb(new Error('Unable to get OAuth token'));
        return;
      }

      cb(undefined, val.body);
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
// or a client: client_id
const getUserInfo = (token) => {
  const decoded = decode(token);
  if (decoded === null) {
    debug('Invalid token: %o', token);
    return undefined;
  }
  return pick(decoded.payload, decoded.payload.user_id ?
    ['user_id', 'user_name'] : 'client_id');
};

// Validate token signature with the given secret and algorithm.
// It is an error not to provide algorithm as the one specified in the
// token cannot be trusted
// Returns decoded token
const validate = (token, secret, algorithm, cb) => {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: algorithm });

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
    debug('Authenticating request using OAuth bearer access token');

    // Check authorization header field for a bearer access token
    // then verify the access token using jwt
    if (req.headers && req.headers.authorization &&
      /^bearer /i.test(req.headers.authorization)) {
      debug('Validating OAuth bearer access token');

      validate(req.headers.authorization.replace(/^bearer /i, ''),
        secret, algorithm, (err, val) => {
          if (err) {
            edebug('OAuth bearer access token validation failed, %s',
              err.message);
            debug('OAuth bearer access token validation failed, %s',
              err.message);

            res.status(401).header('WWW-Authenticate',
              'Bearer realm="cf",' +
              ' error="invalid_token",' +
              ' error_description="' + err.message + '"').end();
            return;
          }

          debug('Validated OAuth bearer access token');
          // has a valid token, so proceed to process the request
          next();
        });
    }
    else {
      edebug('Invalid OAuth bearer access token, %o',
        req.headers ? req.headers.authorization : '');
      debug('Invalid OAuth bearer access token, %o',
        req.headers ? req.headers.authorization : '');

      res.status(401).header('WWW-Authenticate',
        'Bearer realm="cf"').end();
    }
  };
};

const resourceScopesMissing = (expectedScope) => !expectedScope.resource ||
  expectedScope.resource.length === 0;

// Check whether any of the expected resource scopes are missing, if yes,
// then look to see whether we have any one of the system scopes
const checkScopes = (expectedScope, scopeToCheck) =>
  (resourceScopesMissing(expectedScope) ||
  difference(expectedScope.resource, scopeToCheck).length) &&
  intersection(expectedScope.system, scopeToCheck).length === 0;

// Authorize a given OAuth bearer access token using expected scope
// Expected scope is undefined when no authorization needed
// Expected scope has two parts: resource scope  and/or system scope
// Expect the token to have all of the resource scopes or
// at least one of the system scopes
const authorize = (auth, expectedScope) => {
  debug('Authorizing OAuth token using expected OAuth scope, %o',
    expectedScope);

  // Authorization not required
  if (!expectedScope || isEmpty(expectedScope)) {
    debug('Authorization not required');
    return;
  }

  let scopeToCheck = [];
  try {
    // Get scope from OAuth bearer access token
    scopeToCheck = getScope(auth.replace(/^bearer /i, ''));
  }
  catch(exception) {
    edebug('Exception when checking authorization, %o', exception);
    debug('Exception when checking authorization, %o', exception);

    throw {
      statusCode: 401,
      header: {
        'WWW-Authenticate': 'Bearer realm="cf", error="invalid_token",' +
          ' error_description="malformed"'
      }
    };
  }

  if (checkScopes(expectedScope, scopeToCheck)) {
    // Request does not have expected scopes
    edebug('Unauthorized request with scope %o', scopeToCheck);
    debug('Unauthorized request with scope %o', scopeToCheck);

    throw {
      statusCode: 403,
      header: {
        'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope",' +
          ' error_description="' + (expectedScope.resource || '') + '"'
      }
    };
  }

  debug('Authorized request with scope %o', scopeToCheck);
};

const cache = (authServer, id, secret, scopes) => {
  // Store OAuth bearer access token for reuse
  let token;

  // Wrapper to get OAuth bearer access token
  const wrapper = () => token ? 'Bearer ' + token.access_token : undefined;

  // Get a OAuth bearer access token and then
  // start a timer to refresh the token 2 minutes before expiration
  wrapper.start = (cb) => {
    let cbCalled = false;
    const done = (err) => {
      if (!cbCalled && cb) {
        // callback only one time
        cbCalled = true;
        cb(err);
      }
    };

    // Schedule a timer to refresh OAuth bearer access token
    const refresh = (after) => {
      debug('Scheduling refresh/retry getting OAuth bearer' +
        ' access token after %d msecs', after);
      setTimeout(() => get(), after).unref();
    };

    // Report the error and retry after 2 minutes
    const error = (err) => {
      edebug('Error getting OAuth bearer access token, %o', err);
      debug('Error getting OAuth bearer access token, %o', err);

      // Retry after 2 minutes
      refresh(120000);
      done(err);
    };

    // Get OAuth bearer access token
    const get = () => {
      debug('Getting OAuth bearer access token from endpoint %s for ' +
        'client %s and scopes %s', authServer, id, scopes);

      // Get token from the OAuth token endpoint
      newToken(authServer, id, secret, scopes, (err, t) => {
        if (err) {
          error(err);
          return;
        }

        debug('Got OAuth bearer access token');
        token = t;
        // Convert token expiration period from seconds to milliseconds
        // Without conversion, the token will refresh every 2 minutes
        refresh(Math.max(token.expires_in * 1000 - 120000, 120000));
        done();
      });
    };

    // start to get OAuth bearer access token
    get();
  };

  return wrapper;
};

// Extract basic token to get username and password
const decodeBasicToken = (auth) => {
  try {
    const user = new Buffer(auth.split(' ')[1], 'base64').toString().split(':');
    if (!user[0] || !user[1])
      throw new Error('Invalid token');
    return user;
  }
  catch (e) {
    throw {
      statusCode: 401,
      header: {
        'WWW-Authenticate': 'Basic realm="cf", error="invalid_token",' +
          ' error_description="malformed"'
      }
    };
  }
};

// Get OAuth bearer access token
const getBearerToken = (authServer, id, secret, scopes, cb) => {
  // Get token endpoint from OAuth server
  debug('Getting OAuth bearer access token from endpoint %s for client %s ' +
    'and scopes %s', authServer, id, scopes);

  // Get token endpoint from OAuth token endpoint
  newToken(authServer, id, secret, scopes, (err, t) => {
    if (err) {
      edebug('Error getting OAuth bearer access token, %o', err);
      debug('Error getting OAuth bearer access token, %o', err);
      cb(err, undefined);
      return;
    }

    // Return the OAuth bearer access token
    debug('Got OAuth bearer access token');
    cb(undefined, 'Bearer ' + t.access_token);
  });
};

module.exports.cache = cache;
module.exports.validate = validate;
module.exports.validator = validator;
module.exports.authorize = authorize;
module.exports.getUserInfo = getUserInfo;
module.exports.decodeBasicToken = decodeBasicToken;
module.exports.getBearerToken = getBearerToken;
