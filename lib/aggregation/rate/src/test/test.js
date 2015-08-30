'use strict';

// Usage rating service

const _ = require('underscore');
const cluster = require('abacus-cluster');
const omit = _.omit;
const map = _.map;
const clone = _.clone;
const request = require('abacus-request');

// Configure test db URL
process.env.COUCHDB = process.env.COUCHDB || 'test';

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
const reqmock = extend(clone(request), {
  get: spy((uri, req, cb) => cb(undefined, {
    statusCode: 200,
    body: {
      pricing_country: 'USA'
    }
  }))
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

const rateapp = require('..');

describe('abacus-usage-rate', () => {
  describe('usage rating', () => {
    it('rates usage', function(done) {
      this.timeout(60000);

      // Create a test rate app
      const app = rateapp();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Describe a single aggregated usage object to be rated
      const usage = [{
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        start: 1435968000000,
        end: 1436054400000,
        resources: [{
          resource_id: 'object-storage',
          aggregated_usage: [{
            metric: 'storage',
            quantity: 21
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 300
          }, {
            metric: 'heavy_api_calls',
            quantity: 3300
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'storage',
              quantity: 1
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 100
            }, {
              metric: 'heavy_api_calls',
              quantity: 300
            }]
          },
          {
            plan_id: 'standard',
            aggregated_usage: [{
              metric: 'storage',
              quantity: 20
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 200
            }, {
              metric: 'heavy_api_calls',
              quantity: 3000
            }]
          }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'object-storage',
            aggregated_usage: [{
              metric: 'storage',
              quantity: 21
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 300
            }, {
              metric: 'heavy_api_calls',
              quantity: 3300
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'storage',
                quantity: 1
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 100
              }, {
                metric: 'heavy_api_calls',
                quantity: 300
              }]
            },
            {
              plan_id: 'standard',
              aggregated_usage: [{
                metric: 'storage',
                quantity: 20
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 200
              }, {
                metric: 'heavy_api_calls',
                quantity: 3000
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'ALL',
            resources: [{
              resource_id: 'object-storage',
              aggregated_usage: [{
                metric: 'storage',
                quantity: 1
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 100
              }, {
                metric: 'heavy_api_calls',
                quantity: 300
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: 1
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: 100
                }, {
                  metric: 'heavy_api_calls',
                  quantity: 300
                }]
              }]
            }]
          },
          {
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'object-storage',
              aggregated_usage: [{
                metric: 'storage',
                quantity: 20
              }, {
                metric: 'thousand_light_api_calls',
                quantity: 200
              }, {
                metric: 'heavy_api_calls',
                quantity: 3000
              }],
              plans: [{
                plan_id: 'standard',
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: 20
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: 200
                }, {
                  metric: 'heavy_api_calls',
                  quantity: 3000
                }]
              }]
            }]
          }]
        }]
      }];

      // Post aggregated usage to rate
      let locations = {};
      const post = (done) => {
        let cbs = 0;
        const cb = () => {
          if(++cbs === usage.length) done();
        };

        // Post the usage doc
        map(usage, (u) => request.post('http://localhost::p/v1/rating/usage', {
            p: server.address().port,
            body: u
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect a 201 to be return along with the location in the header
            expect(val.statusCode).to.equal(201);
            expect(val.headers.location).to.not.equal(undefined);

            // Record the header location for retrieval later in the test
            locations[u.id] = val.headers.location;
            cb();
          }));
      };

      // Describe the expected rate usage at the end of the test
      const rated = [{
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        start: 1435968000000,
        end: 1436054400000,
        cost: 607,
        resources: [{
          resource_id: 'object-storage',
          cost: 607,
          aggregated_usage: [{
            metric: 'storage',
            quantity: 21,
            cost: 11
          }, {
            metric: 'thousand_light_api_calls',
            quantity: 300,
            cost: 11
          }, {
            metric: 'heavy_api_calls',
            quantity: 3300,
            cost: 585
          }],
          plans: [{
            plan_id: 'basic',
            cost: 49,
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
            }]
          },
          {
            plan_id: 'standard',
            cost: 558,
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
            }]
          }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          cost: 607,
          resources: [{
            resource_id: 'object-storage',
            cost: 607,
            aggregated_usage: [{
              metric: 'storage',
              quantity: 21,
              cost: 11
            }, {
              metric: 'thousand_light_api_calls',
              quantity: 300,
              cost: 11
            }, {
              metric: 'heavy_api_calls',
              quantity: 3300,
              cost: 585
            }],
            plans: [{
              plan_id: 'basic',
              cost: 49,
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
              }]
            },
            {
              plan_id: 'standard',
              cost: 558,
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
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'ALL',
            cost: 49,
            resources: [{
              resource_id: 'object-storage',
              cost: 49,
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
              }],
              plans: [{
                plan_id: 'basic',
                cost: 49,
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
                }]
              }]
            }]
          },
          {
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            cost: 558,
            resources: [{
              resource_id: 'object-storage',
              cost: 558,
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
              }],
              plans: [{
                plan_id: 'standard',
                cost: 558,
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
                }]
              }]
            }]
          }]
        }]
      }];
      // Get the rated usage
      const get = (done) => {
        let cbs = 0;
        const cb = () => {
          if(++cbs === usage.length) done();
        };

        // Call a Get on the app
        map(usage, (u) => request.get(locations[u.id], {}, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Expect our test aggregated values
          if(val.body.end === 1436054400000)
            expect(omit(val.body, 'id')).to.deep.equal(rated[0]);
          cb();
        }));
      };

      // Run the above steps
      post(() => get(done));
    });
  });
});

