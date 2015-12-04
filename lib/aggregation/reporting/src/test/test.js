'use strict';

// Usage reporting service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const oauth = require('abacus-cfoauth');
const dataflow = require('abacus-dataflow');
const yieldable = require('abacus-yieldable');

const map = _.map;
const extend = _.extend;

const brequest = batch(request);

/* eslint quotes: 1 */

// Configure test db URL prefix
process.env.COUCHDB = process.env.COUCHDB || 'test';

// Mock the request module
const getspy = (reqs, cb) => {
  // Expect a call to account
  expect(reqs[0][0]).to.equal(
    'http://localhost:9881/v1/orgs/:org_id/account');

  cb(undefined, map(reqs, (req) => [undefined, {
    statusCode:
      /unauthorized/.test(req[1].org_id || req[1].account_id) ? 401 : 200
  }]));
};

const reqmock = extend({}, request, {
  batch_get: (reqs, cb) => getspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the oauth module with a spy
const validatorspy = spy((req, res, next) => next());
const cachespy = spy(() => {
  const f = () => undefined;
  f.start = () => undefined;
  return f;
});
const oauthmock = extend({}, oauth, {
  validator: () => validatorspy,
  cache: () => cachespy()
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const buildWindow = (q, s, c, ch, bch, bsum) => {
  const windows = map([[0], [0], [0], [{}, 0, 0], [{}, 0, 0]], (w) => {
    return map(w, (wi) => {
      if(!wi && bch || bsum) {
        const newwi = {};
        if(bch)
          extend(newwi, { charge: 0 });
        if(bsum)
          extend(newwi, { summary: 0 });
        return newwi;
      }
      return wi;
    });
  });
  const setWindowProperty = (k, v) => {
    if(typeof v !== 'undefined') {
      windows[3][0][k] = v;
      windows[4][0][k] = v;
    }
  };
  setWindowProperty('quantity', q);
  setWindowProperty('summary', s);
  setWindowProperty('cost', c);
  setWindowProperty('charge', ch);
  return windows;
};

const report = require('..');

const storeRatedUsage = (ratedUsage, cb = () => {}) => {
  const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage');
  yieldable.functioncb(aggregatordb.put)(extend({}, ratedUsage, {
    _id: ratedUsage.id
  }), (err, val) => {
    expect(err).to.equal(null);
    cb();
  });
};

describe('abacus-usage-report', () => {

  context('when rated usage contains small numbers', () => {
    before((done) => {
      const rated = {
        id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        start: 1420502400000,
        end: 1420502500000,
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'storage',
            windows: buildWindow(21)
          }, {
            metric: 'thousand_light_api_calls',
            windows: buildWindow(300)
          }, {
            metric: 'heavy_api_calls',
            windows: buildWindow(3300)
          }, {
            metric: 'memory',
            windows: buildWindow({
              consumed: 32800000,
              consuming: 6,
              since: 1436000000000
            })
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'storage',
              windows: buildWindow(1, undefined, 1)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(100, undefined, 3)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(300, undefined, 45)
            }, {
              metric: 'memory',
              windows: buildWindow({
                consumed: 12400000,
                consuming: 2,
                since: 1436000000000
              }, undefined, {
                burned: 1736,
                burning: 0.00028,
                since: 1436000000000
              })
            }]
          },
            {
              plan_id: 'standard',
              aggregated_usage: [{
                metric: 'storage',
                windows: buildWindow(20, undefined, 10)
              }, {
                metric: 'thousand_light_api_calls',
                windows: buildWindow(200, undefined, 8)
              }, {
                metric: 'heavy_api_calls',
                windows: buildWindow(3000, undefined, 540)
              }, {
                metric: 'memory',
                windows: buildWindow({
                  consumed: 20400000,
                  consuming: 4,
                  since: 1436000000000
                }, undefined, {
                  burned: 5712,
                  burning: 0.00112,
                  since: 1436000000000
                })
              }]
            }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'storage',
              windows: buildWindow(21)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(300)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(3300)
            }, {
              metric: 'memory',
              windows: buildWindow({
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              })
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'storage',
                windows: buildWindow(1, undefined, 1)
              }, {
                metric: 'thousand_light_api_calls',
                windows: buildWindow(100, undefined, 3)

              }, {
                metric: 'heavy_api_calls',
                windows: buildWindow(300, undefined, 45)
              }, {
                metric: 'memory',
                windows: buildWindow({
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }, undefined, {
                  burned: 1736,
                  burning: 0.00028,
                  since: 1436000000000
                })
              }]
            },
              {
                plan_id: 'standard',
                aggregated_usage: [{
                  metric: 'storage',
                  windows: buildWindow(20, undefined, 10)
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: buildWindow(200, undefined, 8)
                }, {
                  metric: 'heavy_api_calls',
                  windows: buildWindow(3000, undefined, 540)
                }, {
                  metric: 'memory',
                  windows: buildWindow({
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }, undefined, {
                    burned: 5712,
                    burning: 0.00112,
                    since: 1436000000000
                  })
                }]
              }]
          }],
          consumers: [{
            consumer_id: 'UNKNOWN',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'storage',
                windows: buildWindow(1)
              }, {
                metric: 'thousand_light_api_calls',
                windows: buildWindow(100)
              }, {
                metric: 'heavy_api_calls',
                windows: buildWindow(300)
              }, {
                metric: 'memory',
                windows: buildWindow({
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                })
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'storage',
                  windows: buildWindow(1, undefined, 1)
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: buildWindow(100, undefined, 3)
                }, {
                  metric: 'heavy_api_calls',
                  windows: buildWindow(300, undefined, 45)
                }, {
                  metric: 'memory',
                  windows: buildWindow({
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }, undefined, {
                    burned: 1736,
                    burning: 0.00028,
                    since: 1436000000000
                  })
                }]
              }]
            }]
          },
            {
              consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
              resources: [{
                resource_id: 'test-resource',
                aggregated_usage: [{
                  metric: 'storage',
                  windows: buildWindow(20)
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: buildWindow(200)
                }, {
                  metric: 'heavy_api_calls',
                  windows: buildWindow(3000)
                }, {
                  metric: 'memory',
                  windows: buildWindow({
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  })
                }],
                plans: [{
                  plan_id: 'standard',
                  aggregated_usage: [{
                    metric: 'storage',
                    windows: buildWindow(20, undefined, 10)
                  }, {
                    metric: 'thousand_light_api_calls',
                    windows: buildWindow(200, undefined, 8)
                  }, {
                    metric: 'heavy_api_calls',
                    windows: buildWindow(3000, undefined, 540)
                  }, {
                    metric: 'memory',
                    windows: buildWindow({
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }, undefined, {
                      burned: 5712,
                      burning: 0.00112,
                      since: 1436000000000
                    })
                  }]
                }]
              }]
            }]
        }]
      };
      storeRatedUsage(rated, done);
    });

    it('retrieves rated usage for an organization', (done) => {

      // Define the expected usage report
      const expected = {
        id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        start: 1420502400000,
        end: 1420502500000,
        windows: buildWindow(undefined, undefined, undefined,
          8055, true),
        resources: [{
          resource_id: 'test-resource',
          windows: buildWindow(undefined, undefined, undefined,
            8055, true),
          aggregated_usage: [{
            metric: 'storage',
            windows: buildWindow(21, 21, undefined, 11, true, true)
          }, {
            metric: 'thousand_light_api_calls',
            windows: buildWindow(300, 300, undefined, 11, true, true)
          }, {
            metric: 'heavy_api_calls',
            windows: buildWindow(3300, 3300, undefined, 585, true, true)
          }, {
            metric: 'memory',
            windows: buildWindow({
              consumed: 32800000,
              consuming: 6,
              since: 1436000000000
            }, 32800000, undefined, 7448, true, true)
          }],
          plans: [{
            plan_id: 'basic',
            windows: buildWindow(undefined, undefined, undefined,
              1785, true),
            aggregated_usage: [{
              metric: 'storage',
              windows: buildWindow(1, 1, 1, 1, true, true)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(100, 100, 3, 3, true, true)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(300, 300, 45, 45, true, true)
            }, {
              metric: 'memory',
              windows: buildWindow({
                consumed: 12400000,
                consuming: 2,
                since: 1436000000000
              }, 12400000, {
                burned: 1736,
                burning: 0.00028,
                since: 1436000000000
              }, 1736, true, true)
            }]
          },
            {
              plan_id: 'standard',
              windows: buildWindow(undefined, undefined, undefined,
                6270, true),
              aggregated_usage: [{
                metric: 'storage',
                windows: buildWindow(20, 20, 10, 10, true, true)
              }, {
                metric: 'thousand_light_api_calls',
                windows: buildWindow(200, 200, 8, 8, true, true)
              }, {
                metric: 'heavy_api_calls',
                windows: buildWindow(3000, 3000, 540, 540, true, true)
              }, {
                metric: 'memory',
                windows: buildWindow({
                  consumed: 20400000,
                  consuming: 4,
                  since: 1436000000000
                }, 20400000, {
                  burned: 5712,
                  burning: 0.00112,
                  since: 1436000000000
                }, 5712, true, true)
              }]
            }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          windows: buildWindow(undefined, undefined, undefined,
            8055, true),
          resources: [{
            resource_id: 'test-resource',
            windows: buildWindow(undefined, undefined, undefined,
              8055, true),
            aggregated_usage: [{
              metric: 'storage',
              windows: buildWindow(21, 21, undefined, 11, true, true)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(300, 300, undefined, 11, true, true)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(3300, 3300, undefined, 585, true, true)
            }, {
              metric: 'memory',
              windows: buildWindow({
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              }, 32800000, undefined, 7448, true, true)
            }],
            plans: [{
              plan_id: 'basic',
              windows: buildWindow(undefined, undefined, undefined,
                1785, true),
              aggregated_usage: [{
                metric: 'storage',
                windows: buildWindow(1, 1, 1, 1, true, true)
              }, {
                metric: 'thousand_light_api_calls',
                windows: buildWindow(100, 100, 3, 3, true, true)
              }, {
                metric: 'heavy_api_calls',
                windows: buildWindow(300, 300, 45, 45, true, true)
              }, {
                metric: 'memory',
                windows: buildWindow({
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }, 12400000, {
                  burned: 1736,
                  burning: 0.00028,
                  since: 1436000000000
                }, 1736, true, true)
              }]
            },
              {
                plan_id: 'standard',
                windows: buildWindow(undefined, undefined, undefined,
                  6270, true),
                aggregated_usage: [{
                  metric: 'storage',
                  windows: buildWindow(20, 20, 10, 10, true, true)
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: buildWindow(200, 200, 8, 8, true, true)
                }, {
                  metric: 'heavy_api_calls',
                  windows: buildWindow(3000, 3000, 540, 540, true, true)
                }, {
                  metric: 'memory',
                  windows: buildWindow({
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }, 20400000, {
                    burned: 5712,
                    burning: 0.00112,
                    since: 1436000000000
                  }, 5712, true, true)
                }]
              }]
          }],
          consumers: [{
            consumer_id: 'UNKNOWN',
            windows: buildWindow(undefined, undefined, undefined,
              1785, true),
            resources: [{
              resource_id: 'test-resource',
              windows: buildWindow(undefined, undefined, undefined,
                1785, true),
              aggregated_usage: [{
                metric: 'storage',
                windows: buildWindow(1, 1, undefined, 1, true, true)
              }, {
                metric: 'thousand_light_api_calls',
                windows: buildWindow(100, 100, undefined, 3, true, true)
              }, {
                metric: 'heavy_api_calls',
                windows: buildWindow(300, 300, undefined, 45, true, true)
              }, {
                metric: 'memory',
                windows: buildWindow({
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }, 12400000, undefined, 1736, true, true)
              }],
              plans: [{
                plan_id: 'basic',
                windows: buildWindow(undefined, undefined, undefined,
                  1785, true),
                aggregated_usage: [{
                  metric: 'storage',
                  windows: buildWindow(1, 1, 1, 1, true, true)
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: buildWindow(100, 100, 3, 3, true, true)
                }, {
                  metric: 'heavy_api_calls',
                  windows: buildWindow(300, 300, 45, 45, true, true)
                }, {
                  metric: 'memory',
                  windows: buildWindow({
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }, 12400000, {
                    burned: 1736,
                    burning: 0.00028,
                    since: 1436000000000
                  }, 1736, true, true)
                }]
              }]
            }]
          },
            {
              consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
              windows: buildWindow(undefined, undefined, undefined,
                6270, true),
              resources: [{
                resource_id: 'test-resource',
                windows: buildWindow(undefined, undefined, undefined,
                  6270, true),
                aggregated_usage: [{
                  metric: 'storage',
                  windows: buildWindow(20, 20, undefined, 10, true, true)
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: buildWindow(200, 200, undefined, 8, true, true)
                }, {
                  metric: 'heavy_api_calls',
                  windows: buildWindow(3000, 3000, undefined, 540, true, true)
                }, {
                  metric: 'memory',
                  windows: buildWindow({
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }, 20400000, undefined, 5712, true, true)
                }],
                plans: [{
                  plan_id: 'standard',
                  windows: buildWindow(undefined, undefined, undefined,
                    6270, true),
                  aggregated_usage: [{
                    metric: 'storage',
                    windows: buildWindow(20, 20, 10, 10, true, true)
                  }, {
                    metric: 'thousand_light_api_calls',
                    windows: buildWindow(200, 200, 8, 8, true, true)
                  }, {
                    metric: 'heavy_api_calls',
                    windows: buildWindow(3000, 3000, 540, 540, true, true)
                  }, {
                    metric: 'memory',
                    windows: buildWindow({
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }, 20400000, {
                      burned: 5712,
                      burning: 0.00112,
                      since: 1436000000000
                    }, 5712, true, true)
                  }]
                }]
              }]
            }]
        }]
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        let cbs = 0;
        const cb = () => {
          if(++cbs === 2) {
            // Check oauth validator spy
            expect(validatorspy.callCount).to.equal(secured ? 2 : 0);

            done();
          }
        };

        // Get the rated usage
        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage/:time', {
            p: server.address().port,
            organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
            time: 1420502600000
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect our test rated usage
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);
            cb();
          });

        // Attempt to get the rated usage for a time in the next month
        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage/:time', {
            p: server.address().port,
            organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
            time: 1422921800000
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect an empty usage report for the month
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal({
              id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001422921800000',
              organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
              start: 1422748800000,
              end: 1422921800000,
              resources: [],
              spaces: []
            });
            cb();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });

    it('queries rated usage for an organization', (done) => {

      // Define a GraphQL query and the corresponding expected result
      const query = '{ organization(organization_id: ' +
        '"a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420502400000) { ' +
        'organization_id, windows { charge }, resources { resource_id, ' +
        'aggregated_usage { metric, windows { summary, charge } }}}}';

      const expected = {
        organization: {
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          windows: buildWindow(undefined, undefined, undefined,
            8055, true),
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'storage',
              windows: buildWindow(undefined, 21, undefined, 11, true, true)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(undefined, 300, undefined, 11, true, true)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(undefined, 3300, undefined, 585, true, true)
            }, {
              metric: 'memory',
              windows: buildWindow(
                undefined, 32800000, undefined, 7448, true, true)
            }]
          }]
        }
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Get the rated usage
        request.get(
          'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
            p: server.address().port,
            query: query
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect our test rated usage
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);

            // Check oauth validator spy
            expect(validatorspy.callCount).to.equal(secured ? 1 : 0);

            done();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });

    it('queries rated usage using GraphQL queries', (done) => {

      // Define the GraphQL query and the corresponding expected result
      const query = '{ organizations(organization_ids: ' +
        '["a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27"], time: 1420502400000) { ' +
        'organization_id, windows { charge }, resources { resource_id, ' +
        'aggregated_usage { metric, windows { charge, summary }}}}}';
      const expected = {
        organizations: [{
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          windows: buildWindow(undefined, undefined, undefined,
            8055, true),
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'storage',
              windows: buildWindow(undefined, 21, undefined, 11, true, true)
            }, {
              metric: 'thousand_light_api_calls',
              windows: buildWindow(undefined, 300, undefined, 11, true, true)
            }, {
              metric: 'heavy_api_calls',
              windows: buildWindow(undefined, 3300, undefined, 585, true, true)
            }, {
              metric: 'memory',
              windows: buildWindow(
                undefined, 32800000, undefined, 7448, true, true)
            }]
          }]
        }]
      };

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        let cbs = 0;
        const cb = () => {
          if (++cbs === 4) {
            // Check oauth validator spy
            expect(validatorspy.callCount).to.equal(secured ? 6 : 0);

            done();
          }
        };

        // Get the rated usage
        brequest.get(
          'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
            p: server.address().port,
            query: query
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect our test rated usage
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(expected);

            cb();
          });

        // Unauthorized organizations and account queries
        const uqueries = ['{ organizations(organization_ids: ' +
          '["unauthorized"]) { ' +
          'organization_id, windows { charge }, resources { resource_id, ' +
          'aggregated_usage { metric, windows { charge, summary }}}}}',
          '{ organization(organization_id: ' +
          '"unauthorized") { ' +
          'organization_id, windows { charge }, resources { resource_id, ' +
          'aggregated_usage { metric, windows { charge, summary }}}}}',
          '{ account(account_id: ' +
          '"unauthorized") { ' +
          'organization_id, windows { charge }, resources { resource_id, ' +
          'aggregated_usage { metric, windows { charge, summary }}}}}'];

        // Get the rated usage for unauthorized org and account
        map(uqueries, (uquery) => {
          brequest.get(
            'http://localhost::p/v1/metering/aggregated/usage/graph/:query', {
              headers: {
                authorization: 'Bearer test'
              },
              p: server.address().port,
              query: uquery
            }, (err, val) => {
              expect(err).to.equal(undefined);

              // Correct expectation is to receive 401 statusCode
              // Expect our test rated usage as empty
              expect(val.statusCode).to.equal(200);
              expect([{ organizations: null }, { organization: null },
                { account: null }]).to.deep.contain(val.body);

              cb();
            });
        });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });
  });

  context('when rated usage contains big numbers', () => {
    before((done) => {
      const bigNumberRated = {
        organization_id: '610f6508-8b5d-4840-888d-0615ade33117',
        resources: [
          {
            resource_id: 'test-resource',
            plans: [
              {
                plan_id: 'basic',
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          cost: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 0,
                            consuming: 0.5,
                            since: 1448457443000
                          },
                          cost: {
                            burned: 0,
                            burning: 7e-05,
                            since: 1448457443000
                          },
                          summary: 0.036679722222222225,
                          charge: 5.13516111111111e-06
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 156250,
                            consuming: 0.625,
                            since: 1448457443000
                          },
                          cost: {
                            burned: 21.875,
                            burning: 8.75e-05,
                            since: 1448457443000
                          },
                          summary: 0.08925243055555555,
                          charge: 1.249534027777778e-05
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 19690125,
                            consuming: 7.125,
                            since: 1448457443000
                          },
                          cost: {
                            burned: 2756.6175,
                            burning: 0.0009975,
                            since: 1448457443000
                          },
                          summary: 5.992165208333334,
                          charge: 0.0008389031291666666
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 1454053167.96875,
                            consuming: 9.28515625,
                            since: 1448457443000
                          },
                          cost: {
                            burned: 203567.443515625,
                            burning: 0.001299921875,
                            since: 1448457443000
                          },
                          summary: 404.58481167317706,
                          charge: 0.05664187363424479
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      charge: 0.0008389031291666666
                    }
                  ],
                  [
                    {
                      charge: 0.05664187363424479
                    }
                  ]
                ]
              }
            ],
            aggregated_usage: [
              {
                metric: 'memory',
                windows: [
                  [
                    {
                      quantity: 0,
                      summary: 0,
                      charge: 0
                    }
                  ],
                  [
                    {
                      quantity: {
                        consumed: 0,
                        consuming: 0.5,
                        since: 1448457443000
                      },
                      summary: 0.036679722222222225,
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      quantity: {
                        consumed: 156250,
                        consuming: 0.625,
                        since: 1448457443000
                      },
                      summary: 0.08925243055555555,
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      quantity: {
                        consumed: 19690125,
                        consuming: 7.125,
                        since: 1448457443000
                      },
                      summary: 5.992165208333334,
                      charge: 0.0008389031291666666
                    }
                  ],
                  [
                    {
                      quantity: {
                        consumed: 1454053167.96875,
                        consuming: 9.28515625,
                        since: 1448457443000
                      },
                      summary: 404.58481167317706,
                      charge: 0.05664187363424479
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 5.13516111111111e-06
                }
              ],
              [
                {
                  charge: 1.249534027777778e-05
                }
              ],
              [
                {
                  charge: 0.0008389031291666666
                }
              ],
              [
                {
                  charge: 0.05664187363424479
                }
              ]
            ]
          }
        ],
        spaces: [
          {
            space_id: '582018c9-e396-4f59-9945-b1bd579a819b',
            resources: [
              {
                resource_id: 'test-resource',
                plans: [
                  {
                    plan_id: 'basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.03125,
                                since: 1448284898000
                              },
                              cost: {
                                burned: 0,
                                burning: 4.375e-06,
                                since: 1448284898000
                              },
                              summary: 1.5000789409722222,
                              charge: 0.0002100110517361111
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 0,
                            consuming: 0.03125,
                            since: 1448284898000
                          },
                          summary: 1.5000789409722222,
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            consumers: [
              {
                consumer_id: 'UNKNOWN',
                resources: [
                  {
                    resource_id: 'test-resource',
                    plans: [
                      {
                        plan_id: 'basic',
                        aggregated_usage: [
                          {
                            metric: 'memory',
                            windows: [
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 0,
                                    consuming: 0.03125,
                                    since: 1448284898000
                                  },
                                  cost: {
                                    burned: 0,
                                    burning: 4.375e-06,
                                    since: 1448284898000
                                  },
                                  summary: 1.5000789409722222,
                                  charge: 0.0002100110517361111
                                }
                              ]
                            ]
                          }
                        ],
                        windows: [
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0.0002100110517361111
                            }
                          ]
                        ]
                      }
                    ],
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.03125,
                                since: 1448284898000
                              },
                              summary: 1.5000789409722222,
                              charge: 0.0002100110517361111
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0.0002100110517361111
                }
              ]
            ]
          },
          {
            space_id: 'c228ecc8-15eb-446f-a4e6-a2d05a729b98',
            resources: [
              {
                resource_id: 'test-resource',
                plans: [
                  {
                    plan_id: 'basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.03125,
                                since: 1448284898000
                              },
                              cost: {
                                burned: 0,
                                burning: 4.375e-06,
                                since: 1448284898000
                              },
                              summary: 1.5000789409722222,
                              charge: 0.0002100110517361111
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 0,
                            consuming: 0.03125,
                            since: 1448284898000
                          },
                          summary: 1.5000789409722222,
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            consumers: [
              {
                consumer_id: 'UNKNOWN',
                resources: [
                  {
                    resource_id: 'test-resource',
                    plans: [
                      {
                        plan_id: 'basic',
                        aggregated_usage: [
                          {
                            metric: 'memory',
                            windows: [
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 0,
                                    consuming: 0.03125,
                                    since: 1448284898000
                                  },
                                  cost: {
                                    burned: 0,
                                    burning: 4.375e-06,
                                    since: 1448284898000
                                  },
                                  summary: 1.5000789409722222,
                                  charge: 0.0002100110517361111
                                }
                              ]
                            ]
                          }
                        ],
                        windows: [
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0.0002100110517361111
                            }
                          ]
                        ]
                      }
                    ],
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.03125,
                                since: 1448284898000
                              },
                              summary: 1.5000789409722222,
                              charge: 0.0002100110517361111
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.0002100110517361111
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.0002100110517361111
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0.0002100110517361111
                }
              ]
            ]
          },
          {
            space_id: '69d4d85b-03f7-436e-b293-94d1803b42bf',
            resources: [
              {
                resource_id: 'test-resource',
                plans: [
                  {
                    plan_id: 'basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 78616062.5,
                                consuming: 2.09765625,
                                since: 1448357888000
                              },
                              cost: {
                                burned: 11006.24875,
                                burning: 0.000293671875,
                                since: 1448357888000
                              },
                              summary: 80.0006135828993,
                              charge: 0.011200085901605903
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.011200085901605903
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 78616062.5,
                            consuming: 2.09765625,
                            since: 1448357888000
                          },
                          summary: 80.0006135828993,
                          charge: 0.011200085901605903
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.011200085901605903
                    }
                  ]
                ]
              }
            ],
            consumers: [
              {
                consumer_id: 'UNKNOWN',
                resources: [
                  {
                    resource_id: 'test-resource',
                    plans: [
                      {
                        plan_id: 'basic',
                        aggregated_usage: [
                          {
                            metric: 'memory',
                            windows: [
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 78616062.5,
                                    consuming: 2.09765625,
                                    since: 1448357888000
                                  },
                                  cost: {
                                    burned: 11006.24875,
                                    burning: 0.000293671875,
                                    since: 1448357888000
                                  },
                                  summary: 80.0006135828993,
                                  charge: 0.011200085901605903
                                }
                              ]
                            ]
                          }
                        ],
                        windows: [
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0.011200085901605903
                            }
                          ]
                        ]
                      }
                    ],
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 78616062.5,
                                consuming: 2.09765625,
                                since: 1448357888000
                              },
                              summary: 80.0006135828993,
                              charge: 0.011200085901605903
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0.011200085901605903
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0.011200085901605903
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0.011200085901605903
                }
              ]
            ]
          },
          {
            space_id: '4ef2f706-f2ae-4be5-a18c-40a969cf8fb6',
            resources: [
              {
                resource_id: 'test-resource',
                plans: [
                  {
                    plan_id: 'basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.5,
                                since: 1448457443000
                              },
                              cost: {
                                burned: 0,
                                burning: 7e-05,
                                since: 1448457443000
                              },
                              summary: 0.036679722222222225,
                              charge: 5.13516111111111e-06
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 156250,
                                consuming: 0.625,
                                since: 1448457443000
                              },
                              cost: {
                                burned: 21.875,
                                burning: 8.75e-05,
                                since: 1448457443000
                              },
                              summary: 0.08925243055555555,
                              charge: 1.249534027777778e-05
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 19684375,
                                consuming: 7.125,
                                since: 1448457443000
                              },
                              cost: {
                                burned: 2755.8125,
                                burning: 0.0009975,
                                since: 1448457443000
                              },
                              summary: 5.990567986111111,
                              charge: 0.0008386795180555555
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 1155809375,
                                consuming: 7.125,
                                since: 1448457443000
                              },
                              cost: {
                                burned: 161813.3125,
                                burning: 0.0009975,
                                since: 1448457443000
                              },
                              summary: 321.5808457638889,
                              charge: 0.04502131840694444
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 5.13516111111111e-06
                        }
                      ],
                      [
                        {
                          charge: 1.249534027777778e-05
                        }
                      ],
                      [
                        {
                          charge: 0.0008386795180555555
                        }
                      ],
                      [
                        {
                          charge: 0.04502131840694444
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 0,
                            consuming: 0.5,
                            since: 1448457443000
                          },
                          summary: 0.036679722222222225,
                          charge: 5.13516111111111e-06
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 156250,
                            consuming: 0.625,
                            since: 1448457443000
                          },
                          summary: 0.08925243055555555,
                          charge: 1.249534027777778e-05
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 19684375,
                            consuming: 7.125,
                            since: 1448457443000
                          },
                          summary: 5.990567986111111,
                          charge: 0.0008386795180555555
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 1155809375,
                            consuming: 7.125,
                            since: 1448457443000
                          },
                          summary: 321.5808457638889,
                          charge: 0.04502131840694444
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      charge: 0.0008386795180555555
                    }
                  ],
                  [
                    {
                      charge: 0.04502131840694444
                    }
                  ]
                ]
              }
            ],
            consumers: [
              {
                consumer_id: 'UNKNOWN',
                resources: [
                  {
                    resource_id: 'test-resource',
                    plans: [
                      {
                        plan_id: 'basic',
                        aggregated_usage: [
                          {
                            metric: 'memory',
                            windows: [
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 0,
                                    consuming: 0.5,
                                    since: 1448457443000
                                  },
                                  cost: {
                                    burned: 0,
                                    burning: 7e-05,
                                    since: 1448457443000
                                  },
                                  summary: 0.036679722222222225,
                                  charge: 5.13516111111111e-06
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 156250,
                                    consuming: 0.625,
                                    since: 1448457443000
                                  },
                                  cost: {
                                    burned: 21.875,
                                    burning: 8.75e-05,
                                    since: 1448457443000
                                  },
                                  summary: 0.08925243055555555,
                                  charge: 1.249534027777778e-05
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 19684375,
                                    consuming: 7.125,
                                    since: 1448457443000
                                  },
                                  cost: {
                                    burned: 2755.8125,
                                    burning: 0.0009975,
                                    since: 1448457443000
                                  },
                                  summary: 5.990567986111111,
                                  charge: 0.0008386795180555555
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 1155809375,
                                    consuming: 7.125,
                                    since: 1448457443000
                                  },
                                  cost: {
                                    burned: 161813.3125,
                                    burning: 0.0009975,
                                    since: 1448457443000
                                  },
                                  summary: 321.5808457638889,
                                  charge: 0.04502131840694444
                                }
                              ]
                            ]
                          }
                        ],
                        windows: [
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 5.13516111111111e-06
                            }
                          ],
                          [
                            {
                              charge: 1.249534027777778e-05
                            }
                          ],
                          [
                            {
                              charge: 0.0008386795180555555
                            }
                          ],
                          [
                            {
                              charge: 0.04502131840694444
                            }
                          ]
                        ]
                      }
                    ],
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 0,
                                consuming: 0.5,
                                since: 1448457443000
                              },
                              summary: 0.036679722222222225,
                              charge: 5.13516111111111e-06
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 156250,
                                consuming: 0.625,
                                since: 1448457443000
                              },
                              summary: 0.08925243055555555,
                              charge: 1.249534027777778e-05
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 19684375,
                                consuming: 7.125,
                                since: 1448457443000
                              },
                              summary: 5.990567986111111,
                              charge: 0.0008386795180555555
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 1155809375,
                                consuming: 7.125,
                                since: 1448457443000
                              },
                              summary: 321.5808457638889,
                              charge: 0.04502131840694444
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 5.13516111111111e-06
                        }
                      ],
                      [
                        {
                          charge: 1.249534027777778e-05
                        }
                      ],
                      [
                        {
                          charge: 0.0008386795180555555
                        }
                      ],
                      [
                        {
                          charge: 0.04502131840694444
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 5.13516111111111e-06
                    }
                  ],
                  [
                    {
                      charge: 1.249534027777778e-05
                    }
                  ],
                  [
                    {
                      charge: 0.0008386795180555555
                    }
                  ],
                  [
                    {
                      charge: 0.04502131840694444
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 5.13516111111111e-06
                }
              ],
              [
                {
                  charge: 1.249534027777778e-05
                }
              ],
              [
                {
                  charge: 0.0008386795180555555
                }
              ],
              [
                {
                  charge: 0.04502131840694444
                }
              ]
            ]
          },
          {
            space_id: 'eac5125c-74ff-4984-9ba6-2eea7158490f',
            resources: [
              {
                resource_id: 'test-resource',
                plans: [
                  {
                    plan_id: 'basic',
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              cost: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 5750,
                                consuming: 0,
                                since: 1448442514000
                              },
                              cost: {
                                burned: 0.805,
                                burning: 0,
                                since: 1448442514000
                              },
                              summary: 0.0015972222222222223,
                              charge: 2.2361111111111e-07
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 11500,
                                consuming: 0,
                                since: 1448442514000
                              },
                              cost: {
                                burned: 1.61,
                                burning: 0,
                                since: 1448442514000
                              },
                              summary: 0.0031944444444444446,
                              charge: 4.4722222222222e-07
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 2.2361111111111e-07
                        }
                      ],
                      [
                        {
                          charge: 4.4722222222222e-07
                        }
                      ]
                    ]
                  }
                ],
                aggregated_usage: [
                  {
                    metric: 'memory',
                    windows: [
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: 0,
                          summary: 0,
                          charge: 0
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 5750,
                            consuming: 0,
                            since: 1448442514000
                          },
                          summary: 0.0015972222222222223,
                          charge: 2.2361111111111e-07
                        }
                      ],
                      [
                        {
                          quantity: {
                            consumed: 11500,
                            consuming: 0,
                            since: 1448442514000
                          },
                          summary: 0.0031944444444444446,
                          charge: 4.4722222222222e-07
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 2.2361111111111e-07
                    }
                  ],
                  [
                    {
                      charge: 4.4722222222222e-07
                    }
                  ]
                ]
              }
            ],
            consumers: [
              {
                consumer_id: 'UNKNOWN',
                resources: [
                  {
                    resource_id: 'test-resource',
                    plans: [
                      {
                        plan_id: 'basic',
                        aggregated_usage: [
                          {
                            metric: 'memory',
                            windows: [
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: 0,
                                  cost: 0,
                                  summary: 0,
                                  charge: 0
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 5750,
                                    consuming: 0,
                                    since: 1448442514000
                                  },
                                  cost: {
                                    burned: 0.805,
                                    burning: 0,
                                    since: 1448442514000
                                  },
                                  summary: 0.0015972222222222223,
                                  charge: 2.2361111111111e-07
                                }
                              ],
                              [
                                {
                                  quantity: {
                                    consumed: 11500,
                                    consuming: 0,
                                    since: 1448442514000
                                  },
                                  cost: {
                                    burned: 1.61,
                                    burning: 0,
                                    since: 1448442514000
                                  },
                                  summary: 0.0031944444444444446,
                                  charge: 4.4722222222222e-07
                                }
                              ]
                            ]
                          }
                        ],
                        windows: [
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 0
                            }
                          ],
                          [
                            {
                              charge: 2.2361111111111e-07
                            }
                          ],
                          [
                            {
                              charge: 4.4722222222222e-07
                            }
                          ]
                        ]
                      }
                    ],
                    aggregated_usage: [
                      {
                        metric: 'memory',
                        windows: [
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: 0,
                              summary: 0,
                              charge: 0
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 5750,
                                consuming: 0,
                                since: 1448442514000
                              },
                              summary: 0.0015972222222222223,
                              charge: 2.2361111111111e-07
                            }
                          ],
                          [
                            {
                              quantity: {
                                consumed: 11500,
                                consuming: 0,
                                since: 1448442514000
                              },
                              summary: 0.0031944444444444446,
                              charge: 4.4722222222222e-07
                            }
                          ]
                        ]
                      }
                    ],
                    windows: [
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 0
                        }
                      ],
                      [
                        {
                          charge: 2.2361111111111e-07
                        }
                      ],
                      [
                        {
                          charge: 4.4722222222222e-07
                        }
                      ]
                    ]
                  }
                ],
                windows: [
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 0
                    }
                  ],
                  [
                    {
                      charge: 2.2361111111111e-07
                    }
                  ],
                  [
                    {
                      charge: 4.4722222222222e-07
                    }
                  ]
                ]
              }
            ],
            windows: [
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 0
                }
              ],
              [
                {
                  charge: 2.2361111111111e-07
                }
              ],
              [
                {
                  charge: 4.4722222222222e-07
                }
              ]
            ]
          }
        ],
        start: 1448284898000,
        end: 1448457443000,
        id: 'k/610f6508-8b5d-4840-888d-0615ade33117/t/0001448457444188-0-0-1-0',
        processed: 1448457444188,
        windows: [
          [
            {
              charge: 0
            }
          ],
          [
            {
              charge: 5.13516111111111e-06
            }
          ],
          [
            {
              charge: 1.249534027777778e-05
            }
          ],
          [
            {
              charge: 0.0008389031291666666
            }
          ],
          [
            {
              charge: 0.05664187363424479
            }
          ]
        ]
      };
      storeRatedUsage(bigNumberRated, done);
    });

    it('retrieves rated usage with 16 significant digits', (done) => {
      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        validatorspy.reset();

        // Create a test report app
        const app = report();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Get the rated usage
        request.get(
          'http://localhost::p/v1/metering/organizations/' +
          ':organization_id/aggregated/usage', {
            p: server.address().port,
            organization_id: '610f6508-8b5d-4840-888d-0615ade33117'
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect test rated usage without error
            expect(val.statusCode).to.equal(200);
            expect(validatorspy.callCount).to.equal(secured ? 1 : 0);
            done();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });
  });

});
