'use strict';

const _ = require('underscore');
const extend = _.extend;
const last = _.last;

describe('Polling', () => {
  let client;

  // Delete cached modules exports
  const deleteModules = () => {
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];
  };

  beforeEach(() => {
    deleteModules();

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch, retry, breaker and throttle modules
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

    client = require('..');
  });

  afterEach(() => {
    deleteModules();

    client = undefined;
  });

  context('waiting on an endpoint', () => {
    const express = require('abacus-express');
    const request = require('abacus-request');
    const router = require('abacus-router');

    let server;
    let serverPort;
    let requests = [];

    beforeEach(() => {
      const app = express();
      const routes = router();

      let requestNumber = 0;
      routes.get('/test', (request, response) => {
        if (requestNumber > requests.length)
          response.status(last(requests)).send({});
        else
          response.status(requests[requestNumber++]).send({});
      });

      app.use(routes);
      app.use(router.batch(routes));
      server = app.listen(0);
      serverPort = server.address().port;
    });

    context('when check is successful', () => {
      beforeEach(() => {
        requests = [200, 200, 500, 200];
      });

      it('succeeds', (done) => {
        client.waitForStartAndPoll('http://localhost::p/test', undefined, {
          p: serverPort,
          fn: (checkFn, cb) => {
            request.get('http://localhost::p/test', { p: serverPort },
              (error, response) => {
                try {
                  checkFn(error, response);
                }
                catch (e) {
                  cb(e);
                }
                cb();
              });
          },
          checkFn: (error, response) => {
            expect(error).to.equal(undefined);
            expect(response.statusCode).to.equal(200);
          },
          pollInterval: 10
        }, done);
      });
    });

    context('when check failed', () => {
      beforeEach(() => {
        requests = [200, 200, 500];
      });

      it('errors', (done) => {
        client.waitForStartAndPoll('http://localhost::p/test', undefined, {
          p: serverPort,
          fn: (checkFn, cb) => {
            request.get('http://localhost::p/test', { p: serverPort },
              (error, response) => {
                try {
                  checkFn(error, response);
                }
                catch (e) {
                  cb(e);
                }
                cb();
              });
          },
          checkFn: (error, response) => {
            expect(error).to.equal(undefined);
            expect(response.statusCode).to.equal(200);
          }
        }, done);
      });
    });

    context('without check function', () => {});
    context('when initial start fail', () => {});
  });


});
