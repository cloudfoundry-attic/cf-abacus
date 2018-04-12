'use strict';

const _ = require('underscore');
const extend = _.extend;

// Mock the cluster module
const cluster = require('abacus-cluster');
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const request = require('abacus-request');

describe('Healthcheck', () => {
  let server;
  let broker;

  const deleteModules = () => {
    delete require.cache[require.resolve('..')];
  };

  beforeEach(() => {
    deleteModules();

    process.env.HEALTHCHECK_SECURED = false;

    broker = require('..');
    const app = broker();
    server = app.listen(0);
  });

  afterEach(() => {
    if (server)
      server.close();

    deleteModules();

    delete process.env.HEALTHCHECK_SECURED;
  });

  it('responds to healthcheck request', (done) => {
    request.get('http://localhost::p/healthcheck', {
      p: server.address().port
    }, (err, response) => {
      expect(err).to.equal(undefined);
      expect(response.statusCode).to.equal(200);
      expect(response.headers).to.not.equal(undefined);
      expect(response.body).to.deep.equal({ healthy:true });

      done();
    });
  });
});
