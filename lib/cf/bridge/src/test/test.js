'use strict';

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

const bridge = require('..');

describe('abacus-cf-bridge', () => {
  let server;

  beforeEach(() => {
    console.log('Before');
    // Create a test bridge app
    const app = bridge();

    // Listen on an ephemeral port
    server = app.listen(0);
  });

  afterEach(() => {
    console.log('After');
    server.close();
  });

  it('responds to get request', function(done) {
    this.timeout(600000);

    request.get('http://localhost::p/v1/cf/bridge', {
      p: server.address().port
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('Hello');

      done();
    });
  });
});
