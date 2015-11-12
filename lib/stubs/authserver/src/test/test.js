'use strict';

// Stub for an authorization server

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

describe('abacus-account-stub', () => {
  it('get OAuth bearer access token', (done) => {
    // Create an authorization server stub application
    const app = authserver();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Get authorization server access token endpoint
    request.get('http://localhost::p/v2/info', {
      p: server.address().port
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);

      // Expect the access token endpoint to match the expectation
      expect(val.body).to.deep.equal({
        token_endpoint: ['http://localhost:', server.address().port].join('')
      });

      // Get OAuth bearer access token with scopes using client credentials
      request.get(val.body.token_endpoint +
        '/oauth/token?grant_type=client_credentials&scope=' +
        encodeURIComponent('test.scope.write test.scope.read'), (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

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

        done();
      });
    });
  });
});
