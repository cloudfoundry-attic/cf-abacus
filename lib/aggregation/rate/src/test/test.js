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
  describe('validate usage rating', () => {
    it('rate a usage', function(done) {
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
          id: 'storage',
          aggregated_usage: [{
            unit: 'STORAGE_PER_MONTH',
            quantity: 21
          }, {
            unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
            quantity: 300
          }, {
            unit: 'HEAVY_API_CALLS_PER_MONTH',
            quantity: 3300
          }],
          plans: [{
            id: 'basic',
            aggregated_usage: [{
              unit: 'STORAGE_PER_MONTH',
              quantity: 1
            }, {
              unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
              quantity: 100
            }, {
              unit: 'HEAVY_API_CALLS_PER_MONTH',
              quantity: 300
            }]
          },
          {
            id: 'standard',
            aggregated_usage: [{
              unit: 'STORAGE_PER_MONTH',
              quantity: 20
            }, {
              unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
              quantity: 200
            }, {
              unit: 'HEAVY_API_CALLS_PER_MONTH',
              quantity: 3000
            }]
          }]
        }],
        spaces: [{
          id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            id: 'storage',
            aggregated_usage: [{
              unit: 'STORAGE_PER_MONTH',
              quantity: 21
            }, {
              unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
              quantity: 300
            }, {
              unit: 'HEAVY_API_CALLS_PER_MONTH',
              quantity: 3300
            }],
            plans: [{
              id: 'basic',
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 1
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 100
              }, {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 300
              }]
            },
            {
              id: 'standard',
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 20
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 200
              }, {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 3000
              }]
            }]
          }],
          consumers: [{
            id: 'all',
            resources: [{
              id: 'storage',
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 1
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 100
              }, {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 300
              }],
              plans: [{
                id: 'basic',
                aggregated_usage: [{
                  unit: 'STORAGE_PER_MONTH',
                  quantity: 1
                }, {
                  unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                  quantity: 100
                }, {
                  unit: 'HEAVY_API_CALLS_PER_MONTH',
                  quantity: 300
                }]
              }]
            }]
          },
          {
            id: 'all2',
            resources: [{
              id: 'storage',
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 20
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 200
              }, {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 3000
              }],
              plans: [{
                id: 'standard',
                aggregated_usage: [{
                  unit: 'STORAGE_PER_MONTH',
                  quantity: 20
                }, {
                  unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                  quantity: 200
                }, {
                  unit: 'HEAVY_API_CALLS_PER_MONTH',
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
          id: 'storage',
          cost: 607,
          aggregated_usage: [{
            unit: 'STORAGE_PER_MONTH',
            quantity: 21,
            cost: 11
          }, {
            unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
            quantity: 300,
            cost: 11
          }, {
            unit: 'HEAVY_API_CALLS_PER_MONTH',
            quantity: 3300,
            cost: 585
          }],
          plans: [{
            id: 'basic',
            cost: 49,
            aggregated_usage: [{
              unit: 'STORAGE_PER_MONTH',
              quantity: 1,
              cost: 1
            }, {
              unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
              quantity: 100,
              cost: 3
            }, {
              unit: 'HEAVY_API_CALLS_PER_MONTH',
              quantity: 300,
              cost: 45
            }]
          },
          {
            id: 'standard',
            cost: 558,
            aggregated_usage: [{
              unit: 'STORAGE_PER_MONTH',
              quantity: 20,
              cost: 10
            }, {
              unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
              quantity: 200,
              cost: 8
            }, {
              unit: 'HEAVY_API_CALLS_PER_MONTH',
              quantity: 3000,
              cost: 540
            }]
          }]
        }],
        spaces: [{
          id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          cost: 607,
          resources: [{
            id: 'storage',
            cost: 607,
            aggregated_usage: [{
              unit: 'STORAGE_PER_MONTH',
              quantity: 21,
              cost: 11
            }, {
              unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
              quantity: 300,
              cost: 11
            }, {
              unit: 'HEAVY_API_CALLS_PER_MONTH',
              quantity: 3300,
              cost: 585
            }],
            plans: [{
              id: 'basic',
              cost: 49,
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 1,
                cost: 1
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 100,
                cost: 3
              }, {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 300,
                cost: 45
              }]
            },
            {
              id: 'standard',
              cost: 558,
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 20,
                cost: 10
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 200,
                cost: 8
              }, {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 3000,
                cost: 540
              }]
            }]
          }],
          consumers: [{
            id: 'all',
            cost: 49,
            resources: [{
              id: 'storage',
              cost: 49,
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 1,
                cost: 1
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 100,
                cost: 3
              }, {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 300,
                cost: 45
              }],
              plans: [{
                id: 'basic',
                cost: 49,
                aggregated_usage: [{
                  unit: 'STORAGE_PER_MONTH',
                  quantity: 1,
                  cost: 1
                }, {
                  unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                  quantity: 100,
                  cost: 3
                }, {
                  unit: 'HEAVY_API_CALLS_PER_MONTH',
                  quantity: 300,
                  cost: 45
                }]
              }]
            }]
          },
          {
            id: 'all2',
            cost: 558,
            resources: [{
              id: 'storage',
              cost: 558,
              aggregated_usage: [{
                unit: 'STORAGE_PER_MONTH',
                quantity: 20,
                cost: 10
              }, {
                unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                quantity: 200,
                cost: 8
              }, {
                unit: 'HEAVY_API_CALLS_PER_MONTH',
                quantity: 3000,
                cost: 540
              }],
              plans: [{
                id: 'standard',
                cost: 558,
                aggregated_usage: [{
                  unit: 'STORAGE_PER_MONTH',
                  quantity: 20,
                  cost: 10
                }, {
                  unit: 'THOUSAND_LIGHT_API_CALLS_PER_MONTH',
                  quantity: 200,
                  cost: 8
                }, {
                  unit: 'HEAVY_API_CALLS_PER_MONTH',
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

