'use strict';

// Usage rating service

const _ = require('underscore');
const request = require('abacus-request');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const oauth = require('abacus-cfoauth');

const extend = _.extend;
const omit = _.omit;

const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-rating-test');

/* eslint handle-callback-err: 0 */

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

// Mock the dbclient module
let putspy;
const dbclientmock = extend((part, uri, cons) => {
  const db = dbclient(part, uri, cons);
  db.__batch_put = db.batch_put;
  db.batch_put =
    (reqs, cb) => putspy(reqs, () => db.__batch_put(reqs, cb))
  return db;
}, dbclient);
require.cache[require.resolve('abacus-dbclient')].exports = dbclientmock;

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
        region: 'us',
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'storage',
            quantity: [[21], [21], [21], [21], [21]]
          }, {
            metric: 'thousand_light_api_calls',
            quantity: [[300], [300], [300], [300], [300]]
          }, {
            metric: 'heavy_api_calls',
            quantity: [[3300], [3300], [3300], [3300], [3300]]
          }, {
            metric: 'memory',
            quantity: [[{
              consumed: 32800000,
              consuming: 6,
              since: 1436000000000
            }],
              [{
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              }],
              [{
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              }],
              [{
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              }],
              [{
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              }]]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'storage',
              quantity: [[1], [1], [1], [1], [1]]
            }, {
              metric: 'thousand_light_api_calls',
              quantity: [[100], [100], [100], [100], [100]]
            }, {
              metric: 'heavy_api_calls',
              quantity: [[300], [300], [300], [300], [300]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 12400000,
                consuming: 2,
                since: 1436000000000
              }],
                [{
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }],
                [{
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }],
                [{
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }],
                [{
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }]]
            }]
          },
            {
              plan_id: 'standard',
              aggregated_usage: [{
                metric: 'storage',
                quantity: [[20], [20], [20], [20], [20]]
              }, {
                metric: 'thousand_light_api_calls',
                quantity: [[200], [200], [200], [200], [200]]
              }, {
                metric: 'heavy_api_calls',
                quantity: [[3000], [3000], [3000], [3000], [3000]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 20400000,
                  consuming: 4,
                  since: 1436000000000
                }],
                  [{
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }]]
              }]
            }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'storage',
              quantity: [[21], [21], [21], [21], [21]]
            }, {
              metric: 'thousand_light_api_calls',
              quantity: [[300], [300], [300], [300], [300]]
            }, {
              metric: 'heavy_api_calls',
              quantity: [[3300], [3300], [3300], [3300], [3300]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              }],
                [{
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }],
                [{
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }],
                [{
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }],
                [{
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }]]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'storage',
                quantity: [[1], [1], [1], [1], [1]]
              }, {
                metric: 'thousand_light_api_calls',
                quantity: [[100], [100], [100], [100], [100]]
              }, {
                metric: 'heavy_api_calls',
                quantity: [[300], [300], [300], [300], [300]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }],
                  [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }]]
              }]
            },
              {
                plan_id: 'standard',
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: [[20], [20], [20], [20], [20]]
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: [[200], [200], [200], [200], [200]]
                }, {
                  metric: 'heavy_api_calls',
                  quantity: [[3000], [3000], [3000], [3000], [3000]]
                }, {
                  metric: 'memory',
                  quantity: [[{
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }],
                    [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }]]
                }]
              }]
          }],
          consumers: [{
            consumer_id: 'ALL',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'storage',
                quantity: [[1], [1], [1], [1], [1]]
              }, {
                metric: 'thousand_light_api_calls',
                quantity: [[100], [100], [100], [100], [100]]
              }, {
                metric: 'heavy_api_calls',
                quantity: [[300], [300], [300], [300], [300]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 12400000,
                  consuming: 2,
                  since: 1436000000000
                }],
                  [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }],
                  [{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }]]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'storage',
                  quantity: [[1], [1], [1], [1], [1]]
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: [[100], [100], [100], [100], [100]]
                }, {
                  metric: 'heavy_api_calls',
                  quantity: [[300], [300], [300], [300], [300]]
                }, {
                  metric: 'memory',
                  quantity: [[{
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }],
                    [{
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }]]
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
                  quantity: [[20], [20], [20], [20], [20]]
                }, {
                  metric: 'thousand_light_api_calls',
                  quantity: [[200], [200], [200], [200], [200]]
                }, {
                  metric: 'heavy_api_calls',
                  quantity: [[3000], [3000], [3000], [3000], [3000]]
                }, {
                  metric: 'memory',
                  quantity: [[{
                    consumed: 20400000,
                    consuming: 4,
                    since: 1436000000000
                  }],
                    [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }],
                    [{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }]]
                }],
                plans: [{
                  plan_id: 'standard',
                  aggregated_usage: [{
                    metric: 'storage',
                    quantity: [[20], [20], [20], [20], [20]]
                  }, {
                    metric: 'thousand_light_api_calls',
                    quantity: [[200], [200], [200], [200], [200]]
                  }, {
                    metric: 'heavy_api_calls',
                    quantity: [[3000], [3000], [3000], [3000], [3000]]
                  }, {
                    metric: 'memory',
                    quantity: [[{
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }],
                      [{
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }],
                      [{
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }],
                      [{
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }],
                      [{
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }]]
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
        region: 'us',
        resources: [{
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'storage',
            windows: [[{
              quantity: 21
            }],
              [{
                quantity: 21
              }],
              [{
                quantity: 21
              }],
              [{
                quantity: 21
              }],
              [{
                quantity: 21
              }]]
          }, {
            metric: 'thousand_light_api_calls',
            windows: [[{
              quantity: 300
            }],
              [{
                quantity: 300
              }],
              [{
                quantity: 300
              }],
              [{
                quantity: 300
              }],
              [{
                quantity: 300
              }]]
          }, {
            metric: 'heavy_api_calls',
            windows: [[{
              quantity: 3300
            }],
              [{
                quantity: 3300
              }],
              [{
                quantity: 3300
              }],
              [{
                quantity: 3300
              }],
              [{
                quantity: 3300
              }]]
          }, {
            metric: 'memory',
            windows: [[{
              quantity: {
                consumed: 32800000,
                consuming: 6,
                since: 1436000000000
              }
            }],
              [{
                quantity: {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }
              }],
              [{
                quantity: {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }
              }],
              [{
                quantity: {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }
              }],
              [{
                quantity: {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }
              }]]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'storage',
              windows: [[{
                quantity: 1,
                cost: 1
              }],
                [{
                  quantity: 1,
                  cost: 1
                }],
                [{
                  quantity: 1,
                  cost: 1
                }],
                [{
                  quantity: 1,
                  cost: 1
                }],
                [{
                  quantity: 1,
                  cost: 1
                }]]
            }, {
              metric: 'thousand_light_api_calls',
              windows: [[{
                quantity: 100,
                cost: 3
              }],
                [{
                  quantity: 100,
                  cost: 3
                }],
                [{
                  quantity: 100,
                  cost: 3
                }],
                [{
                  quantity: 100,
                  cost: 3
                }],
                [{
                  quantity: 100,
                  cost: 3
                }]]
            }, {
              metric: 'heavy_api_calls',
              windows: [[{
                quantity: 300,
                cost: 45
              }],
                [{
                  quantity: 300,
                  cost: 45
                }],
                [{
                  quantity: 300,
                  cost: 45
                }],
                [{
                  quantity: 300,
                  cost: 45
                }],
                [{
                  quantity: 300,
                  cost: 45
                }]]
            }, {
              metric: 'memory',
              windows: [[{
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
              }],
                [{
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
                }],
                [{
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
                }],
                [{
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
                }],
                [{
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
                }]]
            }]
          },
            {
              plan_id: 'standard',
              aggregated_usage: [{
                metric: 'storage',
                windows: [[{
                  quantity: 20,
                  cost: 10
                }],
                  [{
                    quantity: 20,
                    cost: 10
                  }],
                  [{
                    quantity: 20,
                    cost: 10
                  }],
                  [{
                    quantity: 20,
                    cost: 10
                  }],
                  [{
                    quantity: 20,
                    cost: 10
                  }]]
              }, {
                metric: 'thousand_light_api_calls',
                windows: [[{
                  quantity: 200,
                  cost: 8
                }],
                  [{
                    quantity: 200,
                    cost: 8
                  }],
                  [{
                    quantity: 200,
                    cost: 8
                  }],
                  [{
                    quantity: 200,
                    cost: 8
                  }],
                  [{
                    quantity: 200,
                    cost: 8
                  }]]
              }, {
                metric: 'heavy_api_calls',
                windows: [[{
                  quantity: 3000,
                  cost: 540
                }],
                  [{
                    quantity: 3000,
                    cost: 540
                  }],
                  [{
                    quantity: 3000,
                    cost: 540
                  }],
                  [{
                    quantity: 3000,
                    cost: 540
                  }],
                  [{
                    quantity: 3000,
                    cost: 540
                  }]]
              }, {
                metric: 'memory',
                windows: [[{
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
                }],
                  [{
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
                  }],
                  [{
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
                  }],
                  [{
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
                  }],
                  [{
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
                  }]]
              }]
            }]
        }],
        spaces: [{
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'storage',
              windows: [[{
                quantity: 21
              }],
                [{
                  quantity: 21
                }],
                [{
                  quantity: 21
                }],
                [{
                  quantity: 21
                }],
                [{
                  quantity: 21
                }]]
            }, {
              metric: 'thousand_light_api_calls',
              windows: [[{
                quantity: 300
              }],
                [{
                  quantity: 300
                }],
                [{
                  quantity: 300
                }],
                [{
                  quantity: 300
                }],
                [{
                  quantity: 300
                }]]
            }, {
              metric: 'heavy_api_calls',
              windows: [[{
                quantity: 3300
              }],
                [{
                  quantity: 3300
                }],
                [{
                  quantity: 3300
                }],
                [{
                  quantity: 3300
                }],
                [{
                  quantity: 3300
                }]]
            }, {
              metric: 'memory',
              windows: [[{
                quantity: {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1436000000000
                }
              }],
                [{
                  quantity: {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1436000000000
                  }
                }],
                [{
                  quantity: {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1436000000000
                  }
                }],
                [{
                  quantity: {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1436000000000
                  }
                }],
                [{
                  quantity: {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1436000000000
                  }
                }]]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'storage',
                windows: [[{
                  quantity: 1,
                  cost: 1
                }],
                  [{
                    quantity: 1,
                    cost: 1
                  }],
                  [{
                    quantity: 1,
                    cost: 1
                  }],
                  [{
                    quantity: 1,
                    cost: 1
                  }],
                  [{
                    quantity: 1,
                    cost: 1
                  }]]
              }, {
                metric: 'thousand_light_api_calls',
                windows: [[{
                  quantity: 100,
                  cost: 3
                }],
                  [{
                    quantity: 100,
                    cost: 3
                  }],
                  [{
                    quantity: 100,
                    cost: 3
                  }],
                  [{
                    quantity: 100,
                    cost: 3
                  }],
                  [{
                    quantity: 100,
                    cost: 3
                  }]]
              }, {
                metric: 'heavy_api_calls',
                windows: [[{
                  quantity: 300,
                  cost: 45
                }],
                  [{
                    quantity: 300,
                    cost: 45
                  }],
                  [{
                    quantity: 300,
                    cost: 45
                  }],
                  [{
                    quantity: 300,
                    cost: 45
                  }],
                  [{
                    quantity: 300,
                    cost: 45
                  }]]
              }, {
                metric: 'memory',
                windows: [[{
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
                }],
                  [{
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
                  }],
                  [{
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
                  }],
                  [{
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
                  }],
                  [{
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
                  }]]
              }]
            },
              {
                plan_id: 'standard',
                aggregated_usage: [{
                  metric: 'storage',
                  windows: [[{
                    quantity: 20,
                    cost: 10
                  }],
                    [{
                      quantity: 20,
                      cost: 10
                    }],
                    [{
                      quantity: 20,
                      cost: 10
                    }],
                    [{
                      quantity: 20,
                      cost: 10
                    }],
                    [{
                      quantity: 20,
                      cost: 10
                    }]]
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: [[{
                    quantity: 200,
                    cost: 8
                  }],
                    [{
                      quantity: 200,
                      cost: 8
                    }],
                    [{
                      quantity: 200,
                      cost: 8
                    }],
                    [{
                      quantity: 200,
                      cost: 8
                    }],
                    [{
                      quantity: 200,
                      cost: 8
                    }]]
                }, {
                  metric: 'heavy_api_calls',
                  windows: [[{
                    quantity: 3000,
                    cost: 540
                  }],
                    [{
                      quantity: 3000,
                      cost: 540
                    }],
                    [{
                      quantity: 3000,
                      cost: 540
                    }],
                    [{
                      quantity: 3000,
                      cost: 540
                    }],
                    [{
                      quantity: 3000,
                      cost: 540
                    }]]
                }, {
                  metric: 'memory',
                  windows: [[{
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
                  }],
                    [{
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
                    }],
                    [{
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
                    }],
                    [{
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
                    }],
                    [{
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
                    }]]
                }]
              }]
          }],
          consumers: [{
            consumer_id: 'ALL',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'storage',
                windows: [[{
                  quantity: 1
                }],
                  [{
                    quantity: 1
                  }],
                  [{
                    quantity: 1
                  }],
                  [{
                    quantity: 1
                  }],
                  [{
                    quantity: 1
                  }]]
              }, {
                metric: 'thousand_light_api_calls',
                windows: [[{
                  quantity: 100
                }],
                  [{
                    quantity: 100
                  }],
                  [{
                    quantity: 100
                  }],
                  [{
                    quantity: 100
                  }],
                  [{
                    quantity: 100
                  }]]
              }, {
                metric: 'heavy_api_calls',
                windows: [[{
                  quantity: 300
                }],
                  [{
                    quantity: 300
                  }],
                  [{
                    quantity: 300
                  }],
                  [{
                    quantity: 300
                  }],
                  [{
                    quantity: 300
                  }]]
              }, {
                metric: 'memory',
                windows: [[{
                  quantity: {
                    consumed: 12400000,
                    consuming: 2,
                    since: 1436000000000
                  }
                }],
                  [{
                    quantity: {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }
                  }],
                  [{
                    quantity: {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }
                  }],
                  [{
                    quantity: {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }
                  }],
                  [{
                    quantity: {
                      consumed: 12400000,
                      consuming: 2,
                      since: 1436000000000
                    }
                  }]]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'storage',
                  windows: [[{
                    quantity: 1,
                    cost: 1
                  }],
                    [{
                      quantity: 1,
                      cost: 1
                    }],
                    [{
                      quantity: 1,
                      cost: 1
                    }],
                    [{
                      quantity: 1,
                      cost: 1
                    }],
                    [{
                      quantity: 1,
                      cost: 1
                    }]]
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: [[{
                    quantity: 100,
                    cost: 3
                  }],
                    [{
                      quantity: 100,
                      cost: 3
                    }],
                    [{
                      quantity: 100,
                      cost: 3
                    }],
                    [{
                      quantity: 100,
                      cost: 3
                    }],
                    [{
                      quantity: 100,
                      cost: 3
                    }]]
                }, {
                  metric: 'heavy_api_calls',
                  windows: [[{
                    quantity: 300,
                    cost: 45
                  }],
                    [{
                      quantity: 300,
                      cost: 45
                    }],
                    [{
                      quantity: 300,
                      cost: 45
                    }],
                    [{
                      quantity: 300,
                      cost: 45
                    }],
                    [{
                      quantity: 300,
                      cost: 45
                    }]]
                }, {
                  metric: 'memory',
                  windows: [[{
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
                  }],
                    [{
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
                    }],
                    [{
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
                    }],
                    [{
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
                    }],
                    [{
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
                    }]]
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
                  windows: [[{
                    quantity: 20
                  }],
                    [{
                      quantity: 20
                    }],
                    [{
                      quantity: 20
                    }],
                    [{
                      quantity: 20
                    }],
                    [{
                      quantity: 20
                    }]]
                }, {
                  metric: 'thousand_light_api_calls',
                  windows: [[{
                    quantity: 200
                  }],
                    [{
                      quantity: 200
                    }],
                    [{
                      quantity: 200
                    }],
                    [{
                      quantity: 200
                    }],
                    [{
                      quantity: 200
                    }]]
                }, {
                  metric: 'heavy_api_calls',
                  windows: [[{
                    quantity: 3000
                  }],
                    [{
                      quantity: 3000
                    }],
                    [{
                      quantity: 3000
                    }],
                    [{
                      quantity: 3000
                    }],
                    [{
                      quantity: 3000
                    }]]
                }, {
                  metric: 'memory',
                  windows: [[{
                    quantity: {
                      consumed: 20400000,
                      consuming: 4,
                      since: 1436000000000
                    }
                  }],
                    [{
                      quantity: {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }
                    }],
                    [{
                      quantity: {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }
                    }],
                    [{
                      quantity: {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }
                    }],
                    [{
                      quantity: {
                        consumed: 20400000,
                        consuming: 4,
                        since: 1436000000000
                      }
                    }]]
                }],
                plans: [{
                  plan_id: 'standard',
                  aggregated_usage: [{
                    metric: 'storage',
                    windows: [[{
                      quantity: 20,
                      cost: 10
                    }],
                      [{
                        quantity: 20,
                        cost: 10
                      }],
                      [{
                        quantity: 20,
                        cost: 10
                      }],
                      [{
                        quantity: 20,
                        cost: 10
                      }],
                      [{
                        quantity: 20,
                        cost: 10
                      }]]
                  }, {
                    metric: 'thousand_light_api_calls',
                    windows: [[{
                      quantity: 200,
                      cost: 8
                    }],
                      [{
                        quantity: 200,
                        cost: 8
                      }],
                      [{
                        quantity: 200,
                        cost: 8
                      }],
                      [{
                        quantity: 200,
                        cost: 8
                      }],
                      [{
                        quantity: 200,
                        cost: 8
                      }]]
                  }, {
                    metric: 'heavy_api_calls',
                    windows: [[{
                      quantity: 3000,
                      cost: 540
                    }],
                      [{
                        quantity: 3000,
                        cost: 540
                      }],
                      [{
                        quantity: 3000,
                        cost: 540
                      }],
                      [{
                        quantity: 3000,
                        cost: 540
                      }],
                      [{
                        quantity: 3000,
                        cost: 540
                      }]]
                  }, {
                    metric: 'memory',
                    windows: [[{
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
                    }],
                      [{
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
                      }],
                      [{
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
                      }],
                      [{
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
                      }],
                      [{
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
                      }]]
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

        // Handle callback checks
        let checks = 0;
        const check = () => {
          if(++checks == 2) done();
        };

        let puts = 0;
        putspy = (reqs, cb) => {

          // Expect rated usage to be put into the rating db
          const val = reqs[0][0];
          if(val.aggregated_usage_id) {
            debug('Put new rated usage %d %o', puts, reqs);

            expect(omit(val, 'id', 'aggregated_usage_id')).to.deep.equal(
              extend({},
                omit(rated[puts], 'aggregated_usage_id'), {
                  organization_id: [
                    'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
                    secured ? 1 : 0].join('-')
                }));
            puts = puts + 1;

            debug('Rated usage matched %d %o', puts, reqs);
          }

          cb();

          if(puts === 1)
            check();
        };

        // Post aggregated usage to the rating service
        const post = (done) => {

          // Post each usage doc
          transform.reduce(usage, (a, u, i, l, cb) => {
            const uval = extend({}, u, {
              organization_id:
                ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
                  secured ? 1 : 0].join('-')
            });

            request.post('http://localhost::p/v1/rating/aggregated/usage', {
              p: server.address().port,
              body: uval
            }, (err, val) => {
              expect(err).to.equal(undefined);

              // Expect a 201 with the location of the aggregated usage
              expect(val.statusCode).to.equal(201);
              expect(val.headers.location).to.not.equal(undefined);

              // Get aggregated usage back, expecting what we posted
              brequest.get(val.headers.location, {}, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);

                expect(omit(val.body, 'id')).to.deep.equal(uval);
                cb();
              });
            });

          }, undefined, () => {

            // Check oauth validator spy
            expect(oauthspy.callCount).to.equal(
              secured ? usage.length * 3 : 0);

            check();
          });
        };

        // Run the above steps
        post();
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });
  });
});
