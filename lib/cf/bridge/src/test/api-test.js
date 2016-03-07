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
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../paging.js')];
  };

  beforeEach(() => {
    deleteModules();
  });

  afterEach(() => {
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
              guidMinAge: 60000,
              maxIntervalTime: 240000,
              minIntervalTime: 1000,
              secured: false
            },
            statistics: {
              cache: {
                reads: {
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
                  name: 'cache.read'
                },
                writes: {
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
                  name: 'cache.write'
                }
              },
              paging: {
                failure: {
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
                  name: 'paging.failure'
                },
                resources: {
                  end: {
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
                    name: 'paging.resources.end'
                  },
                  failure: {
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
                    name: 'paging.resources.failure'
                  },
                  success: {
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
                    name: 'paging.resources.success'
                  }
                },
                success: {
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
                  name: 'paging.success'
                }
              }
            }
          },
          purgeCompensation: {
            config: {
              currentRetries: 0,
              maxInterval: 240000,
              maxRetries: 12,
              minInterval: 1000
            },
            statistics: {
              apps: {
                failure: {
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
                  name: 'apps.failure'
                },
                save: {
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
                  name: 'apps.save'
                },
                started: {
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
                  name: 'apps.save.started'
                },
                success: {
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
                  name: 'apps.success'
                }
              },
              compensation: {
                failure: {
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
                  name: 'compensation.failure'
                },
                skip: {
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
                  name: 'compensation.skip'
                },
                success: {
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
                  name: 'compensation.success'
                }
              }
            }
          },
          reporting: {
            config: {
              currentRetries: 0,
              maxInterval: 240000,
              maxRetries: 12,
              minInterval: 1000
            },
            statistics: {
              usage: {
                failure: {
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
                  name: 'usage.failure'
                },
                report: {
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
                  name: 'usage.report'
                },
                success: {
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
                  name: 'usage.success'
                }
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
        bridge = require('..');

        // Create a test bridge app
        const app = bridge();

        // Listen on an ephemeral port
        server = app.listen(0);
      });

      it('errors', (done) => {
        request.get('http://localhost::p/v1/cf/bridge', {
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

      it('returns data', (done) => {
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
    })
  });
});
