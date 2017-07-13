'use strict';

const _ = require('underscore');
const extend = _.extend;

describe('Polling', () => {
  let client;

  // Delete cached modules exports
  const deleteModules = () => {
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-express')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-router')];
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
        const index = requestNumber >= requests.length ?
          requests.length - 1 : requestNumber++;
        response.status(requests[index]).send({});
      });

      app.use(routes);
      app.use(router.batch(routes));
      server = app.listen(0);
      serverPort = server.address().port;
    });

    const pollWithCheckFn = (checkFn, cb) => {
      request.get('http://localhost::p/test', { p: serverPort },
        (error, response) => {
          try {
            if (checkFn)
              checkFn(error, response);
          }
          catch (e) {
            cb(e);
            return;
          }
          cb();
        });
    };

    const pollFn = (cb) => request.get('http://localhost::p/test',
      { p: serverPort }, (error, response) => cb(error));

    const buildOptions = (opts) => {
      return extend({
        p: serverPort,
        checkFn: (error, response) => {
          expect(error).to.equal(undefined);
          expect(response.statusCode).to.equal(200);
        },
        pollInterval: 10,
        successCount: 1
      }, opts);
    };

    context('when check is successful', () => {
      beforeEach(() => {
        requests = [200, 200, 500, 200];
        client = require('..');
      });

      it('succeeds', (done) => {
        client.waitForStartAndPoll('http://localhost::p/test', pollWithCheckFn,
          buildOptions(), done);
      });
    });

    context('when check fails', () => {
      beforeEach(() => {
        requests = [200, 500];
        client = require('..');
      });

      it('errors after timeout', (done) => {
        client.waitForStartAndPoll('http://localhost::p/test', pollWithCheckFn,
          buildOptions({ totalTimeout: 3000 }), (error) => {
            expect(error).to.not.equal(undefined);
            done();
          }
        );
      });
    });

    context('without check function', () => {
      beforeEach(() => {
        requests = [200];
        client = require('..');
      });

      it('succeeds', (done) => {
        const options = buildOptions({ checkFn: undefined });
        client.waitForStartAndPoll('http://localhost::p/test', pollFn,
          options, done);
      });
    });

    context('with no options', () => {
      beforeEach(() => {
        requests = [200];
        client = require('..');
      });

      const checkSpy = spy((cb) => {
        cb();
      });

      it('succeeds', (done) => {
        client.waitForStartAndPoll(`http://localhost:${serverPort}/test`,
          pollFn, {}, done);
      });

      it('calls poll with default poll interval', function(done) {
        client.poll(checkSpy, { totalTimeout: 500 }, () => {
          assert.calledTwice(checkSpy);
          done();
        });
      });
    });

    context('when initial start fail', () => {
      beforeEach(() => {
        client = require('..');
      });

      it('time outs', (done) => {
        client.waitForStartAndPoll('http://localhost::p/test', pollWithCheckFn,
          { startTimeout : 1000 }, (error) => {
            expect(error).to.deep.equal(new Error('timeout'));
            done();
          });
      });
    });

    context('with token', () => {
      let reqmock;

      beforeEach(() => {
        requests = [200];

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 200 });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        client = require('..');
      });

      it('succeeds', (done) => {
        const options = buildOptions({ token: () => 'token' });

        client.waitForStartAndPoll('http://localhost::p/test', pollWithCheckFn,
          options, (error) => {
            expect(error).to.equal(undefined);
            expect(reqmock.get.firstCall.args[1].headers.authorization).
              to.equal('token');
            done();
          });
      });
    });
  });


});
