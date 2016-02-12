'use strict';

// Plugin for an authorization server. Implements REST endpoints to retrieve
// access token endpoint details and to get an OAuth bearer access token with
// expected scopes.

const _ = require('underscore');
const router = require('abacus-router');
const webapp = require('abacus-webapp');
const jwt = require('jsonwebtoken');

const extend = _.extend;

// Setup the debug log
const debug = require('abacus-debug')('abacus-authserver-plugin');

// Create an express router
const routes = router();

// Secure the routes or not
const secured = (req) => process.env.SECURED === 'true' &&
  req.headers['x-forwarded-proto'] === 'https';

// Retrieve token point information
routes.get('/v2/info', function *(req) {
  // return token endpoint URL to get a OAuth bearer access token
  return {
    body: {
      token_endpoint: [
        secured(req) ? 'https://' : 'http://',
        req.headers.host
      ].join('')
    }
  };
});

// Retrieve OAuth bearer access token
routes.get('/oauth/token', function *(req) {
  debug('Get OAuth bearer access token');

  // Default OAuth bearer access token
  const token = {
    jti: 'fa1b29fe-76a9-4c2d-903e-dddd0563a9e3',
    sub: 'test-token',
    client_id: 'test-token',
    cid: 'test-token',
    azp: 'test-token',
    grant_type: 'client_credentials',
    iss: req.url,
    zid: 'authserver-plugin',
    aud: [
      'abacus',
      'account',
      'provisioning'
    ]
  };

  // Sign OAuth bearer access token with expected scopes
  const signed = jwt.sign(extend(token, {
    authorities: req.query.scope.split(' '),
    scope: req.query.scope.split(' ')
  }), process.env.JWTKEY || 'encode', {
    algorithm: process.env.JWTALGO,
    expiresIn: 43200
  });

  return {
    body: {
      access_token: signed,
      token_type: 'bearer',
      scope: req.query.scope,
      expires_in: 43200
    }
  };
});

// Create an authorization server plugin application
const authserver = () => {
  const app = webapp();
  app.use(routes);
  return app;
};

// Command line interface, create the app and listen
const runCLI = () => authserver().listen();

// Export our public functions
module.exports = authserver;
module.exports.runCLI = runCLI;
