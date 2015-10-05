'use strict';

// Usage rating service

const _ = require('underscore');

const request = require('abacus-request');
const batch = require('abacus-batch');
const transform = require('abacus-transform');
const cluster = require('abacus-cluster');
const oauth = require('abacus-cfoauth');

const map = _.map;
const extend = _.extend;
const omit = _.omit;

const brequest = batch(request);

// Configure test db URL
process.env.COUCHDB = process.env.COUCHDB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the request module
const reqmock = extend({}, request, {
  batch_get: spy((reqs, cb) => cb(undefined, [[undefined, {
    statusCode: 200,
    body: {
      pricing_country: 'USA'
    }
  }]]))
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const rateapp = require('..');

describe('abacus-usage-rate', () => {
  describe('usage rating', () => {
    it('rates usage', function(done) {
      this.timeout(60000);

      // Define aggregated usage to be rated
      const usage = [{
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        start: 1435968000000,
        end: 1436054400000,
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'storage',
            quantity: [21, 21, 21, 21, 21, 21, 21]
          }, {
            metric: 'thousand_light_api_calls',
            quantity: [300, 300, 300, 300, 300, 300, 300]
          }, {
            metric: 'heavy_api_calls',
            quantity: [3300, 3300, 3300, 3300, 3300, 3300, 3300]
          }, {
            metric: 'memory',
            quantity: [{
              consumed: 32800000,
              consuming: 6,
              since: 1436000000000
            },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              }]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'storage',
              quantity: [1, 1, 1, 1, 1, 1, 1]
            }, {
              metric: 'thousand_light_api_calls',
              quantity: [100, 100, 100, 100, 100, 100, 100]
            }, {
              metric: 'heavy_api_calls',
              quantity: [300, 300, 300, 300, 300, 300, 300]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 12400000,
                consuming: 2,
                since: 1436000000000
              },
                {
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                {
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                {
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                {
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                {
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                {
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }]
            }]
          },
            {
              plan_id: 'standard',
              aggregated_usage: [{
                metric: 'storage',
                quantity: [20, 20, 20, 20, 20, 20, 20]
              }, {
                metric: 'thousand_light_api_calls',
                quantity: [200, 200, 200, 200, 200, 200, 200]
              }, {
                metric: 'heavy_api_calls',
                quantity: [3000, 3000, 3000, 3000, 3000, 3000, 3000]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 20400000,
                  consuming: 4,
                  since: 1436000000000
                },
                  {
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                  {
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                  {
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                  {
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                  {
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                  {
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }]
              }]
            }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'storage',
              quantity: [21, 21, 21, 21, 21, 21, 21]
            }, {
              metric: 'thousand_light_api_calls',
              quantity: [300, 300, 300, 300, 300, 300, 300]
            }, {
              metric: 'heavy_api_calls',
              quantity: [3300, 3300, 3300, 3300, 3300, 3300, 3300]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'storage',
                quantity: [1, 1, 1, 1, 1, 1, 1]
              }, {
                metric: 'thousand_light_api_calls',
                quantity: [100, 100, 100, 100, 100, 100, 100]
              }, {
                metric: 'heavy_api_calls',
                quantity: [300, 300, 300, 300, 300, 300, 300]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }]
              }]
            },
              {
                plan_id: 'standard',
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: [20, 20, 20, 20, 20, 20, 20]
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: [200, 200, 200, 200, 200, 200, 200]
                }, {
                  metric: 'heavy_api_calls',
                  quantity: [3000, 3000, 3000, 3000, 3000, 3000, 3000]
                }, {
                  metric: 'memory',
                  quantity: [{
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }]
                }]
              }]
          }],
          consumers: [{
            consumer_id: 'ALL',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'storage',
                quantity: [1, 1, 1, 1, 1, 1, 1]
              }, {
                metric: 'thousand_light_api_calls',
                quantity: [100, 100, 100, 100, 100, 100, 100]
              }, {
                metric: 'heavy_api_calls',
                quantity: [300, 300, 300, 300, 300, 300, 300]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                  {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: [1, 1, 1, 1, 1, 1, 1]
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: [100, 100, 100, 100, 100, 100, 100]
                }, {
                  metric: 'heavy_api_calls',
                  quantity: [300, 300, 300, 300, 300, 300, 300]
                }, {
                  metric: 'memory',
                  quantity: [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  },
                    {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    },
                    {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    },
                    {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    },
                    {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    },
                    {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    },
                    {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }]
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
                  quantity: [20, 20, 20, 20, 20, 20, 20]
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: [200, 200, 200, 200, 200, 200, 200]
                }, {
                  metric: 'heavy_api_calls',
                  quantity: [3000, 3000, 3000, 3000, 3000, 3000, 3000]
                }, {
                  metric: 'memory',
                  quantity: [{
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                    {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }]
                }],
                plans: [{
                  plan_id: 'standard',
                  aggregated_usage: [{
                    metric: 'storage',
                    quantity: [20, 20, 20, 20, 20, 20, 20]
                  }, {
                    metric: 'thousand_light_api_calls',
                    quantity: [200, 200, 200, 200, 200, 200, 200]
                  }, {
                    metric: 'heavy_api_calls',
                    quantity: [3000, 3000, 3000, 3000, 3000, 3000, 3000]
                  }, {
                    metric: 'memory',
                    quantity: [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    },
                      {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      },
                      {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      },
                      {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      },
                      {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      },
                      {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      },
                      {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }]
                  }]
                }]
              }]
            }]
        }]
      }];

      // Define the expected rated usage
      const rated = [{
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
      }];

      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        oauthspy.reset();

        // Create a test rate app
        const app = rateapp();

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Post aggregated usage to the rating service
        let locations = {};
        const post = (done) => {

          // Post each usage doc
          transform.reduce(usage, (a, u, i, l, cb) =>
            request.post('http://localhost::p/v1/rating/usage', {
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
            }), undefined, () => {
              // Check oauth validator spy
              expect(oauthspy.callCount).to.equal(secured ? usage.length : 0);

              done();
            });
        };

        // Get the rated usage
        const get = (done) => {
          let cbs = 0;
          const cb = () => {
            if(++cbs === usage.length) {
              // Check oauth validator spy
              expect(oauthspy.callCount).to.equal(secured ?
                usage.length + 1 : 0);

              done();
            }
          };

          // Call a Get on the app
          map(usage, (u) => brequest.get(locations[u.id], {}, (err, val) => {
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
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });
  });
});
