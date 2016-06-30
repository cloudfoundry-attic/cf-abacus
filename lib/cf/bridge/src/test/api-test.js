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
  let bridge;

  const secured = process.env.SECURED;

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-paging')];
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
    bridge = undefined;
  });

  context('without security', () => {

    beforeEach(() => {
      bridge = require('..');

      // Create a test bridge app
      const app = bridge();

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

      request.get('http://localhost::p/v1/cf/bridge', {
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        const responseBody = val.body;
        deleteTimeStamps(responseBody);

        expect(responseBody).to.deep.equal({
          bridge: {
            config: {
              secured: false,
              minIntervalTime: 1000,
              maxIntervalTime: 240000,
              guidMinAge: 60000,
              reporting: {
                minInterval: 1000,
                maxInterval: 240000,
                guidMinAge: 60000,
                maxRetries: 12,
                currentRetries: 0
              },
              purgeCompensation: {
                currentRetries: 0,
                maxInterval: 240000,
                maxRetries: 12,
                minInterval: 1000,
                inProgress: false
              }
            },
            cache: {},
            performance: {
              cache: {
                read: {
                  name: 'cache.read',
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
                write: {
                  name: 'cache.write',
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
              paging: {
                pages: {
                  name: 'paging',
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
                resources: {
                  name: 'paging.resources',
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
              usage: {
                name: 'usage',
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
              save: {
                name: 'save',
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
              compensation: {
                circuit: 'closed',
                counts: [
                  {
                    errors: 0,
                    ok: 0,
                    rejects: 0,
                    timeouts: 0
                  }
                ],
                health: [
                  {
                    errors: 0,
                    ok: 0
                  }
                ],
                latencies: [
                  {
                    latencies: []
                  }
                ],
                name: 'compensation'
              },
              fetch: {
                circuit: 'closed',
                counts: [
                  {
                    errors: 0,
                    ok: 0,
                    rejects: 0,
                    timeouts: 0
                  }
                ],
                health: [
                  {
                    errors: 0,
                    ok: 0
                  }
                ],
                latencies: [
                  {
                    latencies: []
                  }
                ],
                name: 'fetch'
              }
            },
            statistics: {
              cache: {
                read: 0,
                write: 0
              },
              usage: {
                missingToken: 0,
                reportFailures: 0,
                reportSuccess: 0,
                reportConflict: 0,
                loopFailures: 0,
                loopSuccess: 0,
                loopConflict: 0,
                loopSkip: 0
              },
              compensation: {
                fetchFailure: 0,
                fetchSuccess: 0,
                saveCalls: 0,
                started: 0,
                usageFailure: 0,
                usageSkip: 0,
                usageSuccess: 0,
                usageConflict: 0
              },
              paging: {
                missingToken: 0,
                pageReadSuccess: 0,
                pageReadFailures: 0,
                pageProcessSuccess: 0,
                pageProcessFailures: 0,
                pageProcessEnd: 0
              }
            }
          }
        });

        done();
      });
    });

    it('responds to compensation post request', (done) => {
      request.post('http://localhost::p/v1/cf/bridge/compensation', {
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(201);

        done();
      });
    });

    it('errors on multiple compensation post requests', (done) => {
      const cb = (status) => {
        expect(status).to.be.oneOf([201, 409]);

        if (status == 409)
          done();
      };

      request.post('http://localhost::p/v1/cf/bridge/compensation', {
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);

        cb(val.statusCode);
      });
      request.post('http://localhost::p/v1/cf/bridge/compensation', {
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);

        cb(val.statusCode);
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
        bridge = require('..');

        // Create a test bridge app
        const app = bridge();

        // Listen on an ephemeral port
        server = app.listen(0);
      });

      it('errors on get', (done) => {
        request.get('http://localhost::p/v1/cf/bridge', {
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);

          done();
        });
      });

      it('errors on post', (done) => {
        request.post('http://localhost::p/v1/cf/bridge/compensation', {
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
          sub: 'abacus-cf-bridge',
          authorities: [
            'abacus.usage.write',
            'abacus.usage.read'
          ],
          scope: [
            'abacus.usage.write',
            'abacus.usage.read'
          ],
          client_id: 'abacus-cf-bridge',
          cid: 'abacus-cf-bridge',
          azp: 'abacus-cf-bridge',
          grant_type: 'client_credentials',
          rev_sig: '2cf89595',
          iat: 1456147679,
          exp: 1456190879,
          iss: 'https://localhost:1234/oauth/token',
          zid: 'uaa',
          aud: [
            'abacus-cf-bridge',
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

        bridge = require('..');

        // Create a test bridge app
        const app = bridge();

        // Listen on an ephemeral port
        server = app.listen(0);
      });

      afterEach(() => {
        process.env.JWTKEY = jwtKey;
        process.env.JWTALGO = jwtAlgo;

        delete require.cache[require.resolve('jsonwebtoken')];
      });

      it('returns data on get', (done) => {
        request.get('http://localhost::p/v1/cf/bridge', {
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

      it('responds on post', (done) => {
        request.post('http://localhost::p/v1/cf/bridge/compensation', {
          headers: {
            authorization: 'bearer ' + signedToken
          },
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.body).to.equal(undefined);

          done();
        });
      });

      it('errors on multiple compensation post requests', (done) => {
        const cb = (status) => {
          expect(status).to.be.oneOf([201, 409]);

          if (status == 409)
            done();
        };

        request.post('http://localhost::p/v1/cf/bridge/compensation', {
          headers: {
            authorization: 'bearer ' + signedToken
          },
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);

          cb(val.statusCode);
        });
        request.post('http://localhost::p/v1/cf/bridge/compensation', {
          headers: {
            authorization: 'bearer ' + signedToken
          },
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);

          cb(val.statusCode);
        });
      });
    });
  });

  context('configuration', () => {
    context('when environment variables are not set', () => {
      it('defaults are used', () => {
        bridge = require('..');
        expect(bridge.reportingConfig.minInterval).to.equal(1000);
        expect(bridge.reportingConfig.maxInterval).to.equal(240000);
        expect(bridge.reportingConfig.guidMinAge).to.equal(60000);
      });
    });

    context('when environment variables are set', () => {
      beforeEach(() => {
        // increase values 2x
        process.env.MIN_INTERVAL_TIME = 2000;
        process.env.MAX_INTERVAL_TIME = 480000;
        process.env.GUID_MIN_AGE = 120000;
      });

      afterEach(() => {
        // restore default values
        delete process.env.MIN_INTERVAL_TIME;
        delete process.env.MAX_INTERVAL_TIME;
        delete process.env.GUID_MIN_AGE;
      });

      it('environment variables are used', () => {
        bridge = require('..');
        expect(bridge.reportingConfig.minInterval).to.equal(2000);
        expect(bridge.reportingConfig.maxInterval).to.equal(480000);
        expect(bridge.reportingConfig.guidMinAge).to.equal(120000);
      });
    });
  });

});
