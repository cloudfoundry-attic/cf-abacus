'use strict';

// Plugin for an authorization server

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const jwt = require('jsonwebtoken');

const extend = _.extend;
const omit = _.omit;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const authserver = require('..');

// Setup the debug log
const debug = require('abacus-debug')('abacus-authserver-plugin-test');

describe('abacus-account-plugin', () => {

  it('get OAuth bearer access token', (done) => {

    const verifyAuthServer = (secure, cb) => {
      debug('Starting Auth Server Plugin in %s mode',
        secure ? 'secure' : 'insecure');

      if (secure === true)
        process.env.SECURED = 'true';

      // Create an authorization server plugin application
      const app = authserver();

      // Listen on an ephemeral port
      const server = app.listen(0);

      debug('Auth Server Plugin started on port %d', server.address().port);

      // Get authorization server access token endpoint
      debug('Requesting /v2/info endpoint');
      request.get([
        'http://localhost:',
        server.address().port,
        '/v2/info'
      ].join(''), {
        headers: {
          'x-forwarded-proto': secure ? 'https' : 'http'
        }
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        debug('Info endpoint returned %o', val.body);

        // Expect the access token endpoint to match the expectation
        expect(val.body).to.deep.equal({
          token_endpoint: [
            secure ? 'https' : 'http',
            '://localhost:',
            server.address().port
          ].join('')
        });

        debug('Token endpoint is %s', val.body.token_endpoint);

        // Get OAuth bearer access token with scopes using client credentials
        debug('Fetching new token...');
        request.get('http://localhost::p/oauth/token?' +
          'grant_type=client_credentials&scope=' +
          encodeURIComponent('test.scope.write test.scope.read'), {
            p: server.address().port
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            debug('Got token response %o', val.body);

            // Expect token information to match the expectation
            expect(omit(val.body, 'access_token')).to.deep.equal({
              token_type: 'bearer',
              scope: 'test.scope.write test.scope.read',
              expires_in: 43200
            });

            // Use JWT to verify the OAuth bearer access token
            jwt.verify(val.body.access_token, process.env.JWTKEY || 'encode', {
              algorithms: process.env.JWTALGO
            });

            // Use JWT to decode the access token and verify the scopes
            expect(jwt.decode(val.body.access_token, {
              complete: true
            }).payload.scope).to.deep.equal(['test.scope.write',
              'test.scope.read']);

            debug('Token verified');

            debug('Closing server');
            server.close();
            cb();
          });
      });
    };

    verifyAuthServer(false, () => verifyAuthServer(true, done));
  });
});
