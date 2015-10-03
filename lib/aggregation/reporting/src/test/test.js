'use strict';

// Aggregated usage reporting service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const db = require('abacus-aggregation-db');
const cluster = require('abacus-cluster');
const oauth = require('abacus-cfoauth');

const extend = _.extend;

const brequest = batch(request);

/* eslint quotes: 1 */

// Configure test db URL prefix
process.env.COUCHDB = process.env.COUCHDB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const report = require('..');

describe('abacus-usage-report', () => {
  before((done) => {

    // Store test rated usage in our test db
    const rated = {
      id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      start: 1435968000000,
      end: 1436054400000,
      resources: [{
        resource_id: 'test-resource',
        aggregated_usage: [{
          metric: 'storage',
          quantity: 21
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 300
        }, {
          metric: 'heavy_api_calls',
          quantity: 3300
        }, {
          metric: 'memory',
          quantity: {
            consumed: 32800000,
            consuming: 6,
            since: 1436000000000
          }
        }],
        plans: [{
          plan_id: 'basic',
          aggregated_usage: [{
            metric: 'storage',
            quantity: 1,
            cost: 1
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 100,
            cost: 3
          }, {
            metric: 'heavy_api_calls',
            quantity: 300,
            cost: 45
          }, {
            metric: 'memory',
            quantity: {
              consumed: 12400000,
              consuming: 2,
              since: 1436000000000
            },
            cost: {
              burned: 1735.9999999999998,
              burning: 0.00028,
              since: 1436000000000
            }
          }]
        },
          {
            plan_id: 'standard',
            aggregated_usage: [{
              metric: 'storage',
              quantity: 20,
              cost: 10
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 200,
              cost: 8
            }, {
              metric: 'heavy_api_calls',
              quantity: 3000,
              cost: 540
            }, {
              metric: 'memory',
              quantity: {
                consumed: 20400000,
                consuming: 4,
                since: 1436000000000
              },
              cost: {
                burned: 5711.999999999999,
                burning: 0.00112,
                since: 1436000000000
              }
            }]
          }]
      }],
      spaces: [{
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'storage',
            quantity: 21
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 300
          }, {
            metric: 'heavy_api_calls',
            quantity: 3300
          }, {
            metric: 'memory',
            quantity: {
              consumed: 32800000,
              consuming: 6,
              since: 1436000000000
            }
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1,
              cost: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 100,
              cost: 3
            }, {
              metric: 'heavy_api_calls',
              quantity: 300,
              cost: 45
            }, {
              metric: 'memory',
              quantity: {
                consumed: 12400000,
                consuming: 2,
                since: 1436000000000
              },
              cost: {
                burned: 1735.9999999999998,
                burning: 0.00028,
                since: 1436000000000
              }
            }]
          },
            {
              plan_id: 'standard',
              aggregated_usage: [{
                metric: 'storage',
                quantity: 20,
                cost: 10
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 200,
                cost: 8
              }, {
                metric: 'heavy_api_calls',
                quantity: 3000,
                cost: 540
              }, {
                metric: 'memory',
                quantity: {
                  consumed: 20400000,
                  consuming: 4,
                  since: 1436000000000
                },
                cost: {
                  burned: 5711.999999999999,
                  burning: 0.00112,
                  since: 1436000000000
                }
              }]
            }]
        }],
        consumers: [{
          consumer_id: 'ALL',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 100
            }, {
              metric: 'heavy_api_calls',
              quantity: 300
            }, {
              metric: 'memory',
              quantity: {
                consumed: 12400000,
                consuming: 2,
                since: 1436000000000
              }
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'storage',
                quantity: 1,
                cost: 1
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 100,
                cost: 3
              }, {
                metric: 'heavy_api_calls',
                quantity: 300,
                cost: 45
              }, {
                metric: 'memory',
                quantity: {
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                cost: {
                  burned: 1735.9999999999998,
                  burning: 0.00028,
                  since: 1436000000000
                }
              }]
            }]
          }]
        },
          {
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'storage',
                quantity: 20
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 200
              }, {
                metric: 'heavy_api_calls',
                quantity: 3000
              }, {
                metric: 'memory',
                quantity: {
                  consumed: 20400000,
                  consuming: 4,
                  since: 1436000000000
                }
              }],
              plans: [{
                plan_id: 'standard',
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: 20,
                  cost: 10
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: 200,
                  cost: 8
                }, {
                  metric: 'heavy_api_calls',
                  quantity: 3000,
                  cost: 540
                }, {
                  metric: 'memory',
                  quantity: {
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                  cost: {
                    burned: 5711.999999999999,
                    burning: 0.00112,
                    since: 1436000000000
                  }
                }]
              }]
            }]
          }]
      }]
    };

    const ratedb = db.logdb('test', 'abacus-rated-usage');
    ratedb.put(extend({}, rated, {
      _id: rated.id
    }), (err, val) => {
      expect(err).to.equal(null);
      done();
    });
  });

  it('retrieves rated usage for an organization', function(done) {
    this.timeout(60000);

    // Define the expected usage report
    const expected = {
      id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/t/0001420502400000',
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      start: 1435968000000,
      end: 1436054400000,
      charge: 8054.999999999999,
      resources: [{
        resource_id: 'test-resource',
        charge: 8054.999999999999,
        aggregated_usage: [{
          metric: 'storage',
          quantity: 21,
          summary: 21,
          charge: 11
        }, {
          metric: 'thousand_light_api_calls',
          quantity: 300,
          summary: 300,
          charge: 11
        }, {
          metric: 'heavy_api_calls',
          quantity: 3300,
          summary: 3300,
          charge: 585
        }, {
          metric: 'memory',
          quantity: {
            consumed: 32800000,
            consuming: 6,
            since: 1436000000000
          },
          summary: 32800000,
          charge: 7447.999999999999
        }],
        plans: [{
          plan_id: 'basic',
          charge: 1784.9999999999998,
          aggregated_usage: [{
            metric: 'storage',
            quantity: 1,
            summary: 1,
            cost: 1,
            charge: 1
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 100,
            summary: 100,
            cost: 3,
            charge: 3
          }, {
            metric: 'heavy_api_calls',
            quantity: 300,
            summary: 300,
            cost: 45,
            charge: 45
          }, {
            metric: 'memory',
            quantity: {
              consumed: 12400000,
              consuming: 2,
              since: 1436000000000
            },
            summary: 12400000,
            cost: {
              burned: 1735.9999999999998,
              burning: 0.00028,
              since: 1436000000000
            },
            charge: 1735.9999999999998
          }]
        },
          {
            plan_id: 'standard',
            charge: 6269.999999999999,
            aggregated_usage: [{
              metric: 'storage',
              quantity: 20,
              summary: 20,
              cost: 10,
              charge: 10
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 200,
              summary: 200,
              cost: 8,
              charge: 8
            }, {
              metric: 'heavy_api_calls',
              quantity: 3000,
              summary: 3000,
              cost: 540,
              charge: 540
            }, {
              metric: 'memory',
              quantity: {
                consumed: 20400000,
                consuming: 4,
                since: 1436000000000
              },
              summary: 20400000,
              cost: {
                burned: 5711.999999999999,
                burning: 0.00112,
                since: 1436000000000
              },
              charge: 5711.999999999999
            }]
          }]
      }],
      spaces: [{
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        charge: 8054.999999999999,
        resources: [{
          resource_id: 'test-resource',
          charge: 8054.999999999999,
          aggregated_usage: [{
            metric: 'storage',
            quantity: 21,
            summary: 21,
            charge: 11
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 300,
            summary: 300,
            charge: 11
          }, {
            metric: 'heavy_api_calls',
            quantity: 3300,
            summary: 3300,
            charge: 585
          }, {
            metric: 'memory',
            quantity: {
              consumed: 32800000,
              consuming: 6,
              since: 1436000000000
            },
            summary: 32800000,
            charge: 7447.999999999999
          }],
          plans: [{
            plan_id: 'basic',
            charge: 1784.9999999999998,
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1,
              summary: 1,
              cost: 1,
              charge: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 100,
              summary: 100,
              cost: 3,
              charge: 3
            }, {
              metric: 'heavy_api_calls',
              quantity: 300,
              summary: 300,
              cost: 45,
              charge: 45
            }, {
              metric: 'memory',
              quantity: {
                consumed: 12400000,
                consuming: 2,
                since: 1436000000000
              },
              summary: 12400000,
              cost: {
                burned: 1735.9999999999998,
                burning: 0.00028,
                since: 1436000000000
              },
              charge: 1735.9999999999998
            }]
          },
            {
              plan_id: 'standard',
              charge: 6269.999999999999,
              aggregated_usage: [{
                metric: 'storage',
                quantity: 20,
                summary: 20,
                cost: 10,
                charge: 10
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 200,
                summary: 200,
                cost: 8,
                charge: 8
              }, {
                metric: 'heavy_api_calls',
                quantity: 3000,
                summary: 3000,
                cost: 540,
                charge: 540
              }, {
                metric: 'memory',
                quantity: {
                  consumed: 20400000,
                  consuming: 4,
                  since: 1436000000000
                },
                summary: 20400000,
                cost: {
                  burned: 5711.999999999999,
                  burning: 0.00112,
                  since: 1436000000000
                },
                charge: 5711.999999999999
              }]
            }]
        }],
        consumers: [{
          consumer_id: 'ALL',
          charge: 1784.9999999999998,
          resources: [{
            resource_id: 'test-resource',
            charge: 1784.9999999999998,
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1,
              summary: 1,
              charge: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 100,
              summary: 100,
              charge: 3
            }, {
              metric: 'heavy_api_calls',
              quantity: 300,
              summary: 300,
              charge: 45
            }, {
              metric: 'memory',
              quantity: {
                consumed: 12400000,
                consuming: 2,
                since: 1436000000000
              },
              summary: 12400000,
              charge: 1735.9999999999998
            }],
            plans: [{
              plan_id: 'basic',
              charge: 1784.9999999999998,
              aggregated_usage: [{
                metric: 'storage',
                quantity: 1,
                summary: 1,
                cost: 1,
                charge: 1
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 100,
                summary: 100,
                cost: 3,
                charge: 3
              }, {
                metric: 'heavy_api_calls',
                quantity: 300,
                summary: 300,
                cost: 45,
                charge: 45
              }, {
                metric: 'memory',
                quantity: {
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                summary: 12400000,
                cost: {
                  burned: 1735.9999999999998,
                  burning: 0.00028,
                  since: 1436000000000
                },
                charge: 1735.9999999999998
              }]
            }]
          }]
        },
          {
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            charge: 6269.999999999999,
            resources: [{
              resource_id: 'test-resource',
              charge: 6269.999999999999,
              aggregated_usage: [{
                metric: 'storage',
                quantity: 20,
                summary: 20,
                charge: 10
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 200,
                summary: 200,
                charge: 8
              }, {
                metric: 'heavy_api_calls',
                quantity: 3000,
                summary: 3000,
                charge: 540
              }, {
                metric: 'memory',
                quantity: {
                  consumed: 20400000,
                  consuming: 4,
                  since: 1436000000000
                },
                summary: 20400000,
                charge: 5711.999999999999
              }],
              plans: [{
                plan_id: 'standard',
                charge: 6269.999999999999,
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: 20,
                  summary: 20,
                  cost: 10,
                  charge: 10
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: 200,
                  summary: 200,
                  cost: 8,
                  charge: 8
                }, {
                  metric: 'heavy_api_calls',
                  quantity: 3000,
                  summary: 3000,
                  cost: 540,
                  charge: 540
                }, {
                  metric: 'memory',
                  quantity: {
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                  summary: 20400000,
                  cost: {
                    burned: 5711.999999999999,
                    burning: 0.00112,
                    since: 1436000000000
                  },
                  charge: 5711.999999999999
                }]
              }]
            }]
          }]
      }]
    };

    const verify = (secured, done) => {
      process.env.SECURED = secured ? 'true' : 'false';
      oauthspy.reset();

      // Create a test report app
      const app = report();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Get the rated usage
      request.get(
        'http://localhost::p/v1/organizations/:organization_id/usage/:time', {
          p: server.address().port,
          organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          time: 1420502400000
        }, (err, val) => {
          expect(err).to.equal(undefined);

          // Expect our test rated usage
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(expected);

          // Check oauth validator spy
          expect(oauthspy.callCount).to.equal(secured ? 1 : 0);

          done();
        });
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });

  it('queries rated usage for an organization', function(done) {
    this.timeout(60000);

    // Define a GraphQL query and the corresponding expected result
    const query = '{ organization(organization_id: ' +
      '"a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420502400000) { ' +
      'organization_id, charge, resources { resource_id, aggregated_usage { ' +
      'metric, summary, charge }}}}';

    const expected = {
      organization: {
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        charge: 8054.999999999999,
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'storage',
            summary: 21,
            charge: 11
          }, {
            metric: 'thousand_light_api_calls',
            summary: 300,
            charge: 11
          }, {
            metric: 'heavy_api_calls',
            summary: 3300,
            charge: 585
          }, {
            metric: 'memory',
            summary: 32800000,
            charge: 7447.999999999999
          }]
        }]
      }
    };

    const verify = (secured, done) => {
      process.env.SECURED = secured ? 'true' : 'false';
      oauthspy.reset();

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
          expect(oauthspy.callCount).to.equal(secured ? 1 : 0);

          done();
        });
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });

  it('queries rated usage for a list of organizations', function(done) {
    this.timeout(60000);

    // Define the GraphQL query and the corresponding expected result
    const query = '{ organizations(organization_ids: ' +
      '["a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27"], time: 1420502400000) { ' +
      'organization_id, charge, resources { resource_id, aggregated_usage { ' +
      'metric, summary, charge }}}}';
    const expected = {
      organizations: [{
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        charge: 8054.999999999999,
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'storage',
            summary: 21,
            charge: 11
          }, {
            metric: 'thousand_light_api_calls',
            summary: 300,
            charge: 11
          }, {
            metric: 'heavy_api_calls',
            summary: 3300,
            charge: 585
          }, {
            metric: 'memory',
            summary: 32800000,
            charge: 7447.999999999999
          }]
        }]
      }]
    };

    const verify = (secured, done) => {
      process.env.SECURED = secured ? 'true' : 'false';
      oauthspy.reset();

      // Create a test report app
      const app = report();

      // Listen on an ephemeral port
      const server = app.listen(0);

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

          // Check oauth validator spy
          expect(oauthspy.callCount).to.equal(secured ? 1 : 0);

          done();
        });
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });
});
