'use strict';

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;
const clone = _.clone;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

// Mock the request module
// const reqorig = require.cache[require.resolve('abacus-request')].exports;
const reqmock = extend(clone(request),
  { get: spy((uri, opts, cb) => {
    cb(null, {
      statusCode: 200,
      body: { token_type: 'bearer',
              access_token: 'token',
              expires_in: 10000
            }
    });
  })
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

const bridge = require('..');

describe('CF Token refresh', () => {
  it('obtains uaa token', function(done) {
    this.timeout(5000);

    bridge.obtainToken(function(err, token, timeout) {
      clearTimeout(timeout);

      if (err) throw err;

      expect(token).to.be.an('string');
      expect(token).to.equal('bearer token');
      done();
    });
  });
});

describe('Admin API', () => {
  let server;

  beforeEach(() => {
    // Create a test bridge app
    const app = bridge();

    // Listen on an ephemeral port
    server = app.listen(0);
  });

  afterEach(() => {
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
