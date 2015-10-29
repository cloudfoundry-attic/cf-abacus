'use strict';

const _ = require('underscore');
const extend = _.extend;

// Mock the cluster module
const cluster = require('abacus-cluster');
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

const request = require('abacus-request');
const bridge = require('..');

describe('Admin API', () => {
  let server;

  beforeEach(() => {
    // Create a test bridge app
    const app = bridge();

    // Listen on an ephemeral port
    server = app.listen(0);
  });

  afterEach(() => {
    bridge.stopReporting();
    server.close();

    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../oauth.js')];
    delete require.cache[require.resolve('../paging.js')];
  });

  it('responds to get request', (done) => {

    request.get('http://localhost::p/v1/cf/bridge', {
      p: server.address().port
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.eql({
        reporting: {
          config: {
            minInterval: 1000,
            maxInterval: 240000,
            maxRetries: 12,
            currentRetries: 0
          },
          statistics: {
            reported: 0
          }
        },
        purgeCompensation: {
          config: {
            minInterval: 1000,
            maxInterval: 240000,
            maxRetries: 12,
            currentRetries: 0
          },
          statistics: {
            reported: 0
          }
        }
      });

      done();
    });
  });
});
