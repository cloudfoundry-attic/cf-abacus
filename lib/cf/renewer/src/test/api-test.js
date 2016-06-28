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

describe('Admin API', () => {
  let server;
  let renewer;

  const secured = process.env.SECURED;

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];
  };

  beforeEach(() => {
    deleteModules();
  });

  afterEach(() => {
    if (server)
      server.close();

    deleteModules();

    process.env.SECURED = secured;

    server = undefined;
    renewer = undefined;
  });

  context('without security', () => {

    beforeEach(() => {
      renewer = require('..');

      // Create a test renewer app
      const app = renewer();

      // Listen on an ephemeral port
      server = app.listen(0);
    });

    const deleteTimeStamps = (object) => {
      for (const key in object) {
        if (key === 'i' || key === 'time')
          delete object[key];
        if (object[key] !== null && typeof object[key] == 'object')
          deleteTimeStamps(object[key]);
      }
    };

    it('responds to get request', (done) => {

      request.get('http://localhost::p/v1/cf/renewer', {
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        const responseBody = val.body;
        deleteTimeStamps(responseBody);

        expect(responseBody).to.deep.equal({
          renewer: {
            performance: {
              report: {
                name: 'report',
                counts: [{
                  ok: 0,
                  errors: 0,
                  timeouts: 0,
                  rejects: 0
                }],
                latencies: [{
                  latencies: []
                }],
                health: [{
                  ok: 0,
                  errors: 0
                }],
                circuit: 'closed'
              },
              plan: {
                name: 'plan',
                counts: [{
                  ok: 0,
                  errors: 0,
                  timeouts: 0,
                  rejects: 0
                }],
                latencies: [{
                  latencies: []
                }],
                health: [{
                  ok: 0,
                  errors: 0
                }],
                circuit: 'closed'
              }
            },
            statistics: {
              usage: {
                missingToken: 0,
                reportFailures: 0,
                reportSuccess: 0,
                reportConflict: 0
              },
              plan: {
                getSuccess: 0,
                getFailures: 0
              },
              retries: {
                count: 0
              }
            }
          }
        });

        done();
      });
    });
  });

  context('with security', () => {
    afterEach(() => {
      process.env.SECURED = secured;
    });

    context('and no token', () => {
      beforeEach(() => {
        process.env.SECURED = 'true';
        renewer = require('..');

        // Create a test renewer app
        const app = renewer();

        // Listen on an ephemeral port
        server = app.listen(0);
      });

      it('errors on get', (done) => {
        request.get('http://localhost::p/v1/cf/renewer', {
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);

          done();
        });
      });
    });

    context('and token', () => {
      const tokenSecret = 'secret';
      const tokenAlgorithm = 'HS256';

      const decodedToken = {
        header: {
          alg: tokenAlgorithm
        },
        payload: {
          jti: '254abca5-1c25-40c5-99d7-2cc641791517',
          sub: 'abacus-cf-renewer',
          authorities: [
            'abacus.usage.write',
            'abacus.usage.read'
          ],
          scope: [
            'abacus.usage.write',
            'abacus.usage.read'
          ],
          client_id: 'abacus-cf-renewer',
          cid: 'abacus-cf-renewer',
          azp: 'abacus-cf-renewer',
          grant_type: 'client_credentials',
          rev_sig: '2cf89595',
          iat: 1456147679,
          exp: 1456190879,
          iss: 'https://localhost:1234/oauth/token',
          zid: 'uaa',
          aud: [
            'abacus-cf-renewer',
            'abacus.usage'
          ]
        },
        signature: 'OVNTKTvu-yHI6QXmYxtPeJZofNddX36Mx1q4PDWuYQE'
      };

      let signedToken;

      const jwtKey = process.env.JWTKEY;
      const jwtAlgo = process.env.JWTALGO;

      beforeEach(() => {
        process.env.SECURED = 'true';
        process.env.JWTKEY = tokenSecret;
        process.env.JWTALGO = tokenAlgorithm;

        const jwt = require('jsonwebtoken');
        signedToken = jwt.sign(decodedToken.payload, tokenSecret, {
          expiresIn: 43200
        });

        renewer = require('..');

        // Create a test renewer app
        const app = renewer();

        // Listen on an ephemeral port
        server = app.listen(0);
      });

      afterEach(() => {
        process.env.JWTKEY = jwtKey;
        process.env.JWTALGO = jwtAlgo;

        delete require.cache[require.resolve('jsonwebtoken')];
      });

      it('returns data on get', (done) => {
        request.get('http://localhost::p/v1/cf/renewer', {
          headers: {
            authorization: 'bearer ' + signedToken
          },
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.not.equal(undefined);
          expect(val.body).to.not.equal({});

          done();
        });
      });
    });
  });

  context('configuration', () => {
    context('when environment variables are not set', () => {
      beforeEach(() => {
        delete process.env.RETRY_INTERVAL;
      });

      it('defaults are used', () => {
        renewer = require('..');
        expect(renewer.retryConfig.retryInterval).to.equal(86400000);
      });
    });

    context('when environment variables are set', () => {
      beforeEach(() => {
        // increase values 2x
        process.env.RETRY_INTERVAL = 86400000 * 2;
      });

      afterEach(() => {
        // restore default values
        delete process.env.RETRY_INTERVAL;
      });

      it('environment variables are used', () => {
        renewer = require('..');
        expect(renewer.retryConfig.retryInterval).to.equal(86400000 * 2);
      });
    });
  });

});
