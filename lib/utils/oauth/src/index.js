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

// Retrieve token endpoint from an authorization server
const tokenEndpoint = (apiHostName, cb) => {
  debug('Retrieving token endpoint information from authorization server, %o',
    apiHostName);

  get(apiHostName + '/v2/info',
    (err, val) => {
      if (err) {
        debug('Error getting oauth server information, %o', err);
        cb(err);
        return;
      }

      if (val.statusCode >= 400) {
        debug('%s - %s - has returned an error - response %d' +
          (val.body ? ' %o' : '%s'), val.request.method,
          val.request.path, val.statusCode,
          val.body || '');
        cb(new Error('Unable to get oauth server information'));
        return;
      }

      debug('Retrieved %o', val.body.token_endpoint);

      // Return endpoint host
      if (val.body && val.body.token_endpoint)
        cb(undefined, val.body.token_endpoint);
      else
        cb(new Error('Unable to get token endpoint from oauth server'));
    }
  );
};

// Retrieve token from the endpoint using client credentials
// OAuth trusted client flow.
const newToken = (tokenEndpoint, clientId, secret, scopes, cb) => {
  debug('Retrieving token from access token endpoint, %o', tokenEndpoint);

  get(tokenEndpoint +
    '/oauth/token?grant_type=client_credentials' +
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
        cb(new Error('Unable to get OAUTH token'));
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
    // then verfify the access token using jwt
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

/* eslint complexity: [1, 6] */

// Authorize a given OAuth bearer access token using expected scope
// Expected scope is undefined when no authorization needed
// Expected scope has two parts: resource scope  and/or system scope
// Expect the token to have all of the resource scopes or
// atleast one of the system scopes
const authorize = (auth, escope) => {
  debug('Authorizing OAuth token using expected OAuth scope, %o', escope);

  // Authorization not required
  if (!escope || isEmpty(escope)) {
    debug('Authorization not required');
    return;
  }

  let scope = [];
  try {
    // Get scope from OAuth bearer access token
    scope = getScope(auth.replace(/^bearer /i, ''));
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

  // Check whether any of the expected resource scopes are missing, if yes,
  // then look to see whether we have any one of the system scopes,
  // if we have none, then throw insufficient_scope error
  if ((!escope.resource || escope.resource == false ||
    difference(escope.resource, scope).length) &&
      intersection(escope.system, scope).length === 0) {
    // Request does not have expected scopes
    edebug('Unauthorized request with scope, %o', scope);
    debug('Unauthorized request with scope, %o', scope);

    throw {
      statusCode: 403,
      header: {
        'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope",' +
          ' error_description="' + (escope.resource || '') + '"'
      }
    };
  }

  debug('Authorized request with scope, %o', scope);
};

const cache = (authServer, id, secret, scopes) => {
  // Store OAuth bearer access token for reuse
  let token;

  // Wrapper to get OAuth bearer access token
  const wrapper = () => token ? 'Bearer ' + token.access_token : undefined;

  // Get a OAuth bearer access token and then
  // start a timer to refresh the token 2 minutes before expiration
  wrapper.start = (cb) => {
    let cbs = 0;
    const done = (err) => {
      // callback only one time
      if (++cbs === 1 && cb) cb(err);
    };

    // Schedule a timer to refresh OAuth bearer access token
    const refresh = (after) => {
      debug('Scheduling refresh/retry getting OAuth bearer' +
        ' access token after  %d msecs', after);
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
      debug('Getting OAuth bearer access token');
      // Get token endpoint from OAuth server
      tokenEndpoint(authServer, (err, endpoint) => {
        if (err) {
          error(err);
          return;
        }

        // Get token from the OAuth token endpoint
        newToken(endpoint, id, secret, scopes, (err, t) => {
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
  debug('Getting OAuth bearer access token');
  tokenEndpoint(authServer, (err, endpoint) => {
    if (err) {
      edebug('Error getting OAuth bearer access token, %o', err);
      debug('Error getting OAuth bearer access token, %o', err);
      cb(err, undefined);
      return;
    }

    // Get token endpoint from OAuth token endpoint
    newToken(endpoint, id, secret, scopes, (err, t) => {
      if (err) {
        edebug('Error getting OAuth bearer access token, %o', err);
        debug('Error getting OAuth bearer access token, %o', err);
        cb(err, undefined);
        return;
      };

      // Return the OAuth bearer access token
      debug('Got OAuth bearer access token');
      cb(undefined, 'Bearer ' + t.access_token);
    });
  });
};

module.exports.cache = cache;
module.exports.validate = validate;
module.exports.validator = validator;
module.exports.authorize = authorize;
module.exports.getUserInfo = getUserInfo;
module.exports.decodeBasicToken = decodeBasicToken;
module.exports.getBearerToken = getBearerToken;
