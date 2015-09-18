'use strict';

const _ = require('underscore');
const extend = _.extend;
const clone = _.clone;

// Mock the cluster module
const cluster = require('abacus-cluster');
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

describe('CF Token refresh', () => {

  afterEach(() => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
  });

  context('on success', () => {
    let bridge;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      require.cache[require.resolve('abacus-request')].exports =
        extend(clone(request), {
          get: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 200,
              body: {
                token_type: 'bearer',
                access_token: 'token',
                expires_in: 100000
              }
            });
          })
        });

      bridge = require('..');
    });

    afterEach(() => {
      bridge.stopReporting();
    });

    it('obtains uaa token', function(done) {
      bridge.obtainToken(function(err, token) {
        expect(err).to.equal(null);
        expect(token).to.be.an('string');
        expect(token).to.equal('bearer token');

        done();
      });
    });
  });

  context('on bad response code', () => {
    let bridge;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      require.cache[require.resolve('abacus-request')].exports =
        extend(clone(request), {
          get: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 500,
              body: {}
            });
          })
        });

      bridge = require('..');
    });

    afterEach(() => {
      bridge.stopReporting();
    });

    it('fails to obtains uaa token', function(done) {
      bridge.obtainToken(function(err, token) {
        expect(err).to.equal('Unexpected response 500');
        expect(token).to.equal(null);

        done();
      });
    });
  });

  context('on error', () => {
    let bridge;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      require.cache[require.resolve('abacus-request')].exports =
        extend(clone(request), {
          get: spy((uri, opts, cb) => {
            cb('error', {});
          })
        });

      bridge = require('..');
    });

    afterEach(() => {
      bridge.stopReporting();
    });

    it('fails to obtain uaa token', function(done) {
      bridge.obtainToken(function(err, token) {
        expect(err).to.not.equal(null);
        expect(token).to.equal(null);

        done();
      });
    });
  });
});

