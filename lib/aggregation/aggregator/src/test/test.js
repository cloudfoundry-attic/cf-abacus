'use strict';

// Usage aggregator service.

const _ = require('underscore');
const request = require('abacus-request');
const batch = require('abacus-batch');
const cluster = require('abacus-cluster');
const transform = require('abacus-transform');
const oauth = require('abacus-cfoauth');

const extend = _.extend;
const omit = _.omit;

const brequest = batch(request);

const debug = require('abacus-debug')('abacus-usage-aggregator-test');

/* eslint handle-callback-err: 0 */

// Configure test db URL prefix and rating service URL
process.env.COUCHDB = process.env.COUCHDB || 'test';
process.env.RATING = 'http://localhost::port';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster, {
    single: spy()
  });

// Mock the request module
let postspy;
const reqmock = extend({}, request, {
  batch_post: (reqs, cb) => postspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
let validatorspy, authorizespy, cachespy;
const oauthmock = extend({}, oauth, {
  validator: () => (req, res, next) => validatorspy(req, res, next),
  authorize: (auth, escope) => authorizespy(auth, escope),
  cache: () => cachespy()
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const aggregator = require('..');

describe('abacus-usage-aggregator', () => {
  it('constructs aggregated usage for an organization', () => {
    // Define the aggregated usage we're expecting
    const aggregated = [{
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [[12], [12], [12], [12], [12]]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[12], [12], [12], [12], [12]]
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[12], [12], [12], [12], [12]]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[12], [12], [12], [12], [12]]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[12], [12], [12], [12], [12]]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [[12], [12], [12], [12], [12]]
                }]
              }]
            }]
          }]
        }]
    }, {
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [[22], [22], [22], [22], [22]]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[22], [22], [22], [22], [22]]
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[22], [22], [22], [22], [22]]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[22], [22], [22], [22], [22]]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[22], [22], [22], [22], [22]]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [[22], [22], [22], [22], [22]]
                }]
              }]
            }]
          }]
        }]
    }];

    // Construct aggregated usage using an org aggregated usage object
    const agg = [];
    agg[0] = aggregator.newOrg('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27');
    agg[0].resource('test-resource').metric('heavy_api_calls').quantity = [
      [12], [12], [12], [12], [12]];
    agg[0].resource(
      'test-resource').plan('basic').metric('heavy_api_calls').quantity = [
        [12], [12], [12], [12], [12]];
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').metric('heavy_api_calls').quantity = [
          [12], [12], [12], [12], [12]];
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').plan('basic').metric('heavy_api_calls').quantity = [
          [12], [12], [12], [12], [12]];
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'bbeae239-f3f8-483c-9dd0-de6781c38bab').resource(
          'test-resource').metric('heavy_api_calls').quantity = [
            [12], [12], [12], [12], [12]];
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'bbeae239-f3f8-483c-9dd0-de6781c38bab').resource(
          'test-resource').plan('basic').metric(
            'heavy_api_calls').quantity = [
              [12], [12], [12], [12], [12]];

    // Serialize to JSON to simulate db storage and retrieval, and expect
    // the object tree to match
    expect(JSON.parse(JSON.stringify(agg[0]))).to.deep.equal(aggregated[0]);

    // Serialize to JSON to simulate db storage and retrieval, then revive
    // the org object behavior
    agg[1] = aggregator.reviveOrg(JSON.parse(JSON.stringify(agg[0])));
    agg[1].resource('test-resource').metric('heavy_api_calls').quantity = [
      [22], [22], [22], [22], [22]];
    agg[1].resource(
        'test-resource').plan('basic').metric('heavy_api_calls').quantity = [
          [22], [22], [22], [22], [22]];
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').metric('heavy_api_calls').quantity = [
          [22], [22], [22], [22], [22]];
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').plan('basic').metric('heavy_api_calls').quantity = [
          [22], [22], [22], [22], [22]];
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'bbeae239-f3f8-483c-9dd0-de6781c38bab').resource(
          'test-resource').metric('heavy_api_calls').quantity = [
            [22], [22], [22], [22], [22]];
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'bbeae239-f3f8-483c-9dd0-de6781c38bab').resource(
          'test-resource').plan('basic').metric(
            'heavy_api_calls').quantity = [[22], [22], [22], [22], [22]];

    // Serialize to JSON to simulate db storage and retrieval, and expect
    // the object tree to match
    expect(JSON.parse(JSON.stringify(agg[1]))).to.deep.equal(aggregated[1]);
  });

  it('aggregates usage for an organization', function(done) {
    this.timeout(60000);

    // Define a sequence of accumulated usage for several resource instances
    const usage = [
      {
        collected_usage_id: '555',
        resource_id: 'test-resource',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        start: 1420243200000,
        end: 1420245000000,
        plan_id: 'basic',
        region: 'us',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer: {
          type: 'EXTERNAL',
          consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
        },
        accumulated_usage: [{
          metric: 'heavy_api_calls',
          quantity: [
            [{
              current: 12
            }],
            [{
              current: 12
            }],
            [{
              current: 12
            }],
            [{
              current: 12
            }],
            [{
              current: 12
            }]]
        }, {
          metric: 'memory',
          quantity: [
            [{
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            }],
            [{
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            }],
            [{
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            }],
            [{
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            }],
            [{
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            }]]
        }]
      },
      {
        collected_usage_id: '555',
        resource_id: 'test-resource',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        start: 1420245000000,
        end: 1420247000000,
        plan_id: 'basic',
        region: 'us',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer: {
          type: 'EXTERNAL',
          consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
        },
        accumulated_usage: [
          {
            metric: 'heavy_api_calls',
            quantity: [[{
              current: 10
            }],
            [{
              current: 10
            }],
            [{
              current: 10
            }],
            [{
              previous: 12,
              current: 22
            }],
            [{
              previous: 12,
              current: 22
            }]]
          }, {
            metric: 'memory',
            quantity: [
              [{
                current: {
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }
              }],
              [{
                current: {
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }
              }],
              [{
                current: {
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }
              }],
              [{
                previous: {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                current: {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                }
              }],
              [{
                previous: {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                current: {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                }
              }]]
          }]
      },
      {
        collected_usage_id: '555',
        resource_id: 'test-resource',
        resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
        start: 1420247000000,
        end: 1420249000000,
        plan_id: 'basic',
        region: 'us',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer: {
          type: 'EXTERNAL',
          consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
        },
        accumulated_usage: [{
          metric: 'heavy_api_calls',
          quantity: [[{
            current: 8
          }],
            [{
              current: 8
            }],
            [{
              current: 8
            }],
            [{
              current: 8
            }],
            [{
              current: 8
            }]]
        }, {
          metric: 'memory',
          quantity: [[{
            current: {
              consumed: 0,
              consuming: 3,
              since: 1420247000000
            }
          }],
            [{
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            }],
            [{
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            }],
            [{
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            }],
            [{
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            }]]
        }]
      },
      {
        collected_usage_id: '555',
        resource_id: 'test-resource',
        resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
        start: 1420249000000,
        end: 1420251000000,
        plan_id: 'basic',
        region: 'us',
        organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer: {
          type: 'EXTERNAL',
          consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
        },
        accumulated_usage: [{
          metric: 'heavy_api_calls',
          quantity: [[{
            current: 2
          }],
            [{
              current: 2
            }],
            [{
              current: 2
            }],
            [{
              previous: 8,
              current: 10
            }],
            [{
              previous: 8,
              current: 10
            }]]
        }, {
          metric: 'memory',
          quantity: [[{
            current: {
              consumed: 0,
              consuming: 2,
              since: 1420249000000
            }
          }],
            [{
              current: {
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              }
            }],
            [{
              current: {
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              }
            }],
            [{
              previous: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              },
              current: {
                consumed: 6000000,
                consuming: 2,
                since: 1420249000000
              }
            }],
            [{
              previous: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              },
              current: {
                consumed: 6000000,
                consuming: 2,
                since: 1420249000000
              }
            }]]
        }]
      }];

    // Define the sequence of aggregated usage we're expecting for an org
    const aggregated = [{
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      accumulated_usage_id: '222',
      start: 1420243200000,
      end: 1420245000000,
      region: 'us',
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [[12], [12], [12], [12], [12]]
          }, {
            metric: 'memory',
            quantity: [[{
              consumed: 0,
              consuming: 6,
              since: 1420243200000
            }],
              [{
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }],
              [{
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }],
              [{
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }],
              [{
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }]]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[12], [12], [12], [12], [12]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }],
                [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }],
                [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }],
                [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }],
                [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }]]
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[12], [12], [12], [12], [12]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }],
                [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }],
                [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }],
                [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }],
                [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }]]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[12], [12], [12], [12], [12]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }],
                  [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }],
                  [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }],
                  [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }],
                  [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }]]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[12], [12], [12], [12], [12]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }],
                  [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }],
                  [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }],
                  [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }],
                  [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }]]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [[12], [12], [12], [12], [12]]
                }, {
                  metric: 'memory',
                  quantity: [[{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }],
                    [{
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    }],
                    [{
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    }],
                    [{
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    }],
                    [{
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    }]]
                }]
              }]
            }]
          }]
        }]
    }, {
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      accumulated_usage_id: '223',
      start: 1420243200000,
      end: 1420247000000,
      region: 'us',
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [[10], [10], [10], [22], [22]]
          }, {
            metric: 'memory',
            quantity: [[{
              consumed: 0,
              consuming: 4,
              since: 1420245000000
            }],
              [{
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              }],
              [{
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              }],
              [{
                consumed: 10800000,
                consuming: 4,
                since: 1420245000000
              }],
              [{
                consumed: 10800000,
                consuming: 4,
                since: 1420245000000
              }]]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[10], [10], [10], [22], [22]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              }],
                [{
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }],
                [{
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }],
                [{
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                }],
                [{
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                }]]
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[10], [10], [10], [22], [22]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              }],
                [{
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }],
                [{
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }],
                [{
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                }],
                [{
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                }]]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[10], [10], [10], [22], [22]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }],
                  [{
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  }],
                  [{
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  }],
                  [{
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  }],
                  [{
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  }]]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[10], [10], [10], [22], [22]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                }],
                  [{
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  }],
                  [{
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  }],
                  [{
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  }],
                  [{
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  }]]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [[10], [10], [10], [22], [22]]
                }, {
                  metric: 'memory',
                  quantity: [[{
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  }],
                    [{
                      consumed: 0,
                      consuming: 4,
                      since: 1420245000000
                    }],
                    [{
                      consumed: 0,
                      consuming: 4,
                      since: 1420245000000
                    }],
                    [{
                      consumed: 10800000,
                      consuming: 4,
                      since: 1420245000000
                    }],
                    [{
                      consumed: 10800000,
                      consuming: 4,
                      since: 1420245000000
                    }]]
                }]
              }]
            }]
          }]
        }]
    }, {
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      accumulated_usage_id: '224',
      start: 1420243200000,
      end: 1420249000000,
      region: 'us',
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [[8], [8], [18], [30], [30]]
          }, {
            metric: 'memory',
            quantity: [[{
              consumed: 0,
              consuming: 3,
              since: 1420247000000
            }],
              [{
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }],
              [{
                consumed: 8000000,
                consuming: 7,
                since: 1420247000000
              }],
              [{
                consumed: 18800000,
                consuming: 7,
                since: 1420247000000
              }],
              [{
                consumed: 18800000,
                consuming: 7,
                since: 1420247000000
              }]]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[8], [8], [18], [30], [30]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }],
                [{
                  consumed: 0,
                  consuming: 3,
                  since: 1420247000000
                }],
                [{
                  consumed: 8000000,
                  consuming: 7,
                  since: 1420247000000
                }],
                [{
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                }],
                [{
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                }]]
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[8], [8], [18], [30], [30]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }],
                [{
                  consumed: 0,
                  consuming: 3,
                  since: 1420247000000
                }],
                [{
                  consumed: 8000000,
                  consuming: 7,
                  since: 1420247000000
                }],
                [{
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                }],
                [{
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                }]]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[8], [8], [18], [30], [30]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 0,
                  consuming: 3,
                  since: 1420247000000
                }],
                  [{
                    consumed: 0,
                    consuming: 3,
                    since: 1420247000000
                  }],
                  [{
                    consumed: 8000000,
                    consuming: 7,
                    since: 1420247000000
                  }],
                  [{
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  }],
                  [{
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  }]]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[8], [8], [18], [30], [30]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 0,
                  consuming: 3,
                  since: 1420247000000
                }],
                  [{
                    consumed: 0,
                    consuming: 3,
                    since: 1420247000000
                  }],
                  [{
                    consumed: 8000000,
                    consuming: 7,
                    since: 1420247000000
                  }],
                  [{
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  }],
                  [{
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  }]]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [[8], [8], [18], [30], [30]]
                }, {
                  metric: 'memory',
                  quantity: [[{
                    consumed: 0,
                    consuming: 3,
                    since: 1420247000000
                  }],
                    [{
                      consumed: 0,
                      consuming: 3,
                      since: 1420247000000
                    }],
                    [{
                      consumed: 8000000,
                      consuming: 7,
                      since: 1420247000000
                    }],
                    [{
                      consumed: 18800000,
                      consuming: 7,
                      since: 1420247000000
                    }],
                    [{
                      consumed: 18800000,
                      consuming: 7,
                      since: 1420247000000
                    }]]
                }]
              }]
            }]
          }]
        }]
    }, {
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      accumulated_usage_id: '225',
      start: 1420243200000,
      end: 1420251000000,
      region: 'us',
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [[2], [2], [2], [32], [32]]
          }, {
            metric: 'memory',
            quantity: [[{
              consumed: 0,
              consuming: 2,
              since: 1420249000000
            }],
              [{
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              }],
              [{
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              }],
              [{
                consumed: 32800000,
                consuming: 6,
                since: 1420249000000
              }],
              [{
                consumed: 32800000,
                consuming: 6,
                since: 1420249000000
              }]]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[2], [2], [2], [32], [32]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              }],
                [{
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                }],
                [{
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                }],
                [{
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                }],
                [{
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                }]]
            }]
          }]
        }],
      spaces: [
        {
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          resources: [{
            resource_id: 'test-resource',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [[2], [2], [2], [32], [32]]
            }, {
              metric: 'memory',
              quantity: [[{
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              }],
                [{
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                }],
                [{
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                }],
                [{
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                }],
                [{
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                }]]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[2], [2], [2], [32], [32]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                }],
                  [{
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  }],
                  [{
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  }],
                  [{
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  }],
                  [{
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  }]]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [[2], [2], [2], [32], [32]]
              }, {
                metric: 'memory',
                quantity: [[{
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                }],
                  [{
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  }],
                  [{
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  }],
                  [{
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  }],
                  [{
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  }]]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [[2], [2], [2], [32], [32]]
                }, {
                  metric: 'memory',
                  quantity: [[{
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  }],
                    [{
                      consumed: 0,
                      consuming: 2,
                      since: 1420249000000
                    }],
                    [{
                      consumed: 0,
                      consuming: 2,
                      since: 1420249000000
                    }],
                    [{
                      consumed: 32800000,
                      consuming: 6,
                      since: 1420249000000
                    }],
                    [{
                      consumed: 32800000,
                      consuming: 6,
                      since: 1420249000000
                    }]]
                }]
              }]
            }]
          }]
        }]
    }];

    const verify = (secured, done) => {
      // Set the SECURED environment variable
      process.env.SECURED = secured ? 'true' : 'false';
      cachespy = spy(() => {
        const f = () => undefined;
        f.start = () => undefined;
        return f;
      });

      // Create a test aggregator app
      const app = aggregator();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Handle callback checks
      let checks = 0;
      const check = () => {
        if(++checks == 2) done();
      };

      let posts = 0;
      postspy = (reqs, cb) => {
        debug('Posted new aggregated usage %o', reqs);

        // Expect aggregated usage to be posted to the rating service
        expect(reqs[0][0])
          .to.equal('http://localhost:9410/v1/rating/aggregated/usage');

        // Expect our test aggregated values
        const val = reqs[0][1];
        expect(omit(val.body,
          'id', 'processed', 'accumulated_usage_id')).to.deep.equal(
          extend({},
            omit(aggregated[posts], 'accumulated_usage_id'), {
              organization_id: [
                'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
                secured ? 1 : 0].join('-')
            }));
        posts = posts + 1;

        cb(undefined, [[undefined, {
          statusCode: 200
        }]]);

        if(posts === 4)
          check();
      };

      // Initialize oauth validator spy
      validatorspy = spy((req, res, next) => next());

      // Post accumulated usage to the aggregator
      const post = () => {

        // Post each usage doc
        transform.reduce(usage, (a, u, i, l, cb) => {
          const uval = extend({}, u, {
            organization_id:
              ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
                secured ? 1 : 0].join('-')
          });

          // Initialize oauth authorize spy
          authorizespy = spy(function() {});

          request.post('http://localhost::p/v1/metering/accumulated/usage', {
            p: server.address().port,
            body: uval
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect a 201 with the location of the accumulated usage
            expect(val.statusCode).to.equal(201);
            expect(val.headers.location).to.not.equal(undefined);

            // Check oauth authorize spy
            expect(authorizespy.args[0][0]).to.equal(undefined);
            expect(authorizespy.args[0][1]).to.deep.equal(secured ? {
              system: ['abacus.usage.write']
            } : undefined);

            // Get accumulated usage back, expecting what we posted
            brequest.get(val.headers.location, {}, (err, val) => {
              expect(err).to.equal(undefined);
              expect(val.statusCode).to.equal(200);

              expect(omit(val.body, 'id', 'processed')).to.deep.equal(uval);

              // Check oauth authorize spy
              expect(authorizespy.args[1][0]).to.equal(undefined);
              expect(authorizespy.args[1][1]).to.deep.equal(secured ? {
                system: ['abacus.usage.read']
              } : undefined);

              cb();
            });
          });

        }, undefined, () => {

          // Check oauth validator spy
          expect(validatorspy.callCount).to.equal(secured ? 12 : 0);

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
