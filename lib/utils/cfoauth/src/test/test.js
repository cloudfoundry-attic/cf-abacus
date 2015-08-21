'use strict';

const _ = require('underscore');
const request = require('abacus-request');
const debug = require('abacus-debug')('abacus-oauth');

const clone = _.clone;
const extend = _.extend;

// Mock the request module
const reqmock = extend(clone(request), {
  noWaitPost: spy((uri, req, cb) => cb())
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

process.env.API_HOST_NAME = 'localhost:25000';
process.env.TOKEN_ENDPOINT = 'localhost:35000';
process.env.CLIENT_ID = 'clientid';
process.env.CLIENT_SECRET = 'password';

const apiport = 25000;
const tokenport = 35000;

const info = {
  name: 'CF-instance', build: '210010', version: 2,
  authorization_endpoint: 'https://localhost:40000/UAALoginServerWAR',
  token_endpoint: 'https://uaa.cf.org'
};

const token = {
  access_token: 'AAAAAAAAAA',
  token_type: 'bearer',
  expires_in: 43199,
  scope: 'scim.read cloud_controller.read',
  jti: '2570a1c1-103f-4aae-85f1-35b9564343a5'
};

const oauth = require('..');

describe('Token endpoint', () => {
  let server;
  const express = require('abacus-express');
  const createServer = function(apiport) {
    let app = express();
    app.get('/v2/info', function(req, res) {
      debug('request for info');
      res.status(200).send(info);
    });
    app.get('/e1/v2/info', function(req, res) {
      debug('error');
      res.status(400).send({error: 'Info not available'});
    });
    app.get('/e2/v2/info', function(req, res) {
      debug('error');
      res.status(400).send();
    });
    return app.listen(apiport);
  };

  beforeEach(function() {
    server = createServer(apiport);
  });

  afterEach(function() {
    server.close();
  });

  describe('Get token endpoint', () => {
    it('Endpoint from argument', (done) => {
      oauth.tokenEndpoint('localhost:25000', (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.equal('uaa.cf.org');
        done();
      });
    });
    it('Endpoint from env property', (done) => {
      oauth.tokenEndpoint(null, (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.equal('uaa.cf.org');
        done();
      });
    });
    it('Endpoint from argument - connection error', (done) => {
      oauth.tokenEndpoint('localhost:25001', (err, val) => {
        expect(err).to.not.equal(null);
        expect(val).to.equal(undefined);
        done();
      });
    });
    it('Endpoint from argument - 400 error', (done) => {
      oauth.tokenEndpoint('localhost:25000/e1', (err, val) => {
        expect(err).to.not.equal(null);
        expect(val).to.equal(undefined);
        done();
      });
    });
    it('Endpoint from argument - 400 error, no body', (done) => {
      oauth.tokenEndpoint('localhost:25000/e2', (err, val) => {
        expect(err).to.not.equal(null);
        expect(val).to.equal(undefined);
        done();
      });
    });
  });
});

describe('Token', () => {
  let server;
  const express = require('abacus-express');
  const createServer = function(tokenport) {
    let app = express();
    app.get('/oauth/token',
      function(req, res) {
        debug('token request');
        res.status(200).send(token);
      });
    app.get('/e1/oauth/token',
      function(req, res) {
        debug('error');
        res.status(400).send({error: 'Info not available'});
      });
    app.get('/e2/oauth/token',
      function(req, res) {
        debug('error');
        res.status(400).send();
      });
    return app.listen(tokenport);
  };

  beforeEach(function() {
    server = createServer(tokenport);
  });

  afterEach(function() {
    server.close();
  });

  describe('Get token', () => {
    it('Token from argument', (done) => {
      oauth.newToken('localhost:35000', 'clientid', 'password', null,
        (err, val) => {
          expect(err).to.equal(null);
          // add the additional field (with actual time)
          token.expiry = val.expiry;
          expect(val).to.deep.equal(token);
          done();
        });
    });
    it('Token from argument - error', (done) => {
      oauth.newToken('localhost:35001', 'clientid', 'password', null,
        (err, val) => {
          expect(err).to.not.equal(null);
          expect(val).to.equal(undefined);
          done();
        });
    });
    it('Token from argument - 400', (done) => {
      oauth.newToken('localhost:35000/e1', 'clientid', 'password', null,
        (err, val) => {
          expect(err).to.not.equal(null);
          expect(val).to.equal(undefined);
          done();
        });
    });
    it('Token from argument - 400 - no body', (done) => {
      oauth.newToken('localhost:35000/e1', 'clientid', 'password', null,
        (err, val) => {
          expect(err).to.not.equal(null);
          expect(val).to.equal(undefined);
          done();
        });
    });

    it('Token from env property', (done) => {
      oauth.newToken(null, null, null, null,
        (err, val) => {
          expect(err).to.equal(null);
          // add the additional field (with actual time)
          token.expiry = val.expiry;
          expect(val).to.deep.equal(token);
          done();
        });
    });

    it('Token from env property with scopes', (done) => {
      oauth.newToken(null, null, null, 'scim.read cloud_controller.read',
        (err, val) => {
          expect(err).to.equal(null);
          // add the additional field (with actual time)
          token.expiry = val.expiry;
          expect(val).to.deep.equal(token);
          done();
        });
    });

  });
});
