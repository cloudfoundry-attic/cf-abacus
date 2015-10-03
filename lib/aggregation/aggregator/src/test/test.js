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
const reduce = _.reduce;

const brequest = batch(request);

// Configure test db URL prefix
process.env.COUCHDB = process.env.COUCHDB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster, {
    single: spy()
  });

// Mock the request module
const reqmock = extend({}, request, {
  batch_post: spy((reqs, cb) => cb())
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
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
            quantity: [12, 12, 12, 12, 12, 12, 12]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [12, 12, 12, 12, 12, 12, 12]
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
              quantity: [12, 12, 12, 12, 12, 12, 12]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [12, 12, 12, 12, 12, 12, 12]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [12, 12, 12, 12, 12, 12, 12]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [12, 12, 12, 12, 12, 12, 12]
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
            quantity: [22, 22, 22, 22, 22, 22, 22]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [22, 22, 22, 22, 22, 22, 22]
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
              quantity: [22, 22, 22, 22, 22, 22, 22]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [22, 22, 22, 22, 22, 22, 22]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [22, 22, 22, 22, 22, 22, 22]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [22, 22, 22, 22, 22, 22, 22]
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
      12, 12, 12, 12, 12, 12, 12];
    agg[0].resource(
      'test-resource').plan('basic').metric('heavy_api_calls').quantity = [
        12, 12, 12, 12, 12, 12, 12];
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').metric('heavy_api_calls').quantity = [
          12, 12, 12, 12, 12, 12, 12];
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').plan('basic').metric('heavy_api_calls').quantity = [
          12, 12, 12, 12, 12, 12, 12];
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'bbeae239-f3f8-483c-9dd0-de6781c38bab').resource(
          'test-resource').metric('heavy_api_calls').quantity = [
            12, 12, 12, 12, 12, 12, 12];
    agg[0].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'bbeae239-f3f8-483c-9dd0-de6781c38bab').resource(
          'test-resource').plan('basic').metric(
            'heavy_api_calls').quantity = [
              12, 12, 12, 12, 12, 12, 12];

    // Serialize to JSON to simulate db storage and retrieval, and expect
    // the object tree to match
    expect(JSON.parse(JSON.stringify(agg[0]))).to.deep.equal(aggregated[0]);

    // Serialize to JSON to simulate db storage and retrieval, then revive
    // the org object behavior
    agg[1] = aggregator.reviveOrg(JSON.parse(JSON.stringify(agg[0])));
    agg[1].resource('test-resource').metric('heavy_api_calls').quantity = [
      22, 22, 22, 22, 22, 22, 22];
    agg[1].resource(
        'test-resource').plan('basic').metric('heavy_api_calls').quantity = [
          22, 22, 22, 22, 22, 22, 22];
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').metric('heavy_api_calls').quantity = [
          22, 22, 22, 22, 22, 22, 22];
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').resource(
        'test-resource').plan('basic').metric('heavy_api_calls').quantity = [
          22, 22, 22, 22, 22, 22, 22];
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'bbeae239-f3f8-483c-9dd0-de6781c38bab').resource(
          'test-resource').metric('heavy_api_calls').quantity = [
            22, 22, 22, 22, 22, 22, 22];
    agg[1].space(
      'aaeae239-f3f8-483c-9dd0-de5d41c38b6a').consumer(
        'bbeae239-f3f8-483c-9dd0-de6781c38bab').resource(
          'test-resource').plan('basic').metric(
            'heavy_api_calls').quantity = [22, 22, 22, 22, 22, 22, 22];

    // Serialize to JSON to simulate db storage and retrieval, and expect
    // the object tree to match
    expect(JSON.parse(JSON.stringify(agg[1]))).to.deep.equal(aggregated[1]);
  });

  it('aggregates usage for an organization', function(done) {
    this.timeout(60000);

    // Define a sequence of accumulated usage for several resource instances
    const usage = [
      {
        id: '222',
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
          quantity: [{
            previous: undefined,
            current: 12
          },
            {
              previous: undefined,
              current: 12
            },
            {
              previous: undefined,
              current: 12
            },
            {
              previous: undefined,
              current: 12
            },
            {
              previous: undefined,
              current: 12
            },
            {
              previous: undefined,
              current: 12
            },
            {
              previous: undefined,
              current: 12
            }]
        }, {
          metric: 'memory',
          quantity: [{
            previous: undefined,
            current: {
              consumed: 0,
              consuming: 6,
              since: 1420243200000
            }
          },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }
            }]
        }]
      },
      {
        id: '223',
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
        accumulated_usage: [{
          metric: 'heavy_api_calls',
          quantity: [{
            previous: undefined,
            current: 10
          },
            {
              previous: undefined,
              current: 10
            },
            {
              previous: undefined,
              current: 10
            },
            {
              previous: 12,
              current: 22
            },
            {
              previous: 12,
              current: 22
            },
            {
              previous: 12,
              current: 22
            },
            {
              previous: 12,
              current: 22
            }]
        }, {
          metric: 'memory',
          quantity: [{
            previous: undefined,
            current: {
              consumed: 0,
              consuming: 4,
              since: 1420245000000
            }
          },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              }
            },
            {
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
            },
            {
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
            },
            {
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
            },
            {
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
            }]
        }]
      },
      {
        id: '224',
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
          quantity: [{
            previous: undefined,
            current: 8
          },
            {
              previous: undefined,
              current: 8
            },
            {
              previous: undefined,
              current: 8
            },
            {
              previous: undefined,
              current: 8
            },
            {
              previous: undefined,
              current: 8
            },
            {
              previous: undefined,
              current: 8
            },
            {
              previous: undefined,
              current: 8
            }]
        }, {
          metric: 'memory',
          quantity: [{
            previous: undefined,
            current: {
              consumed: 0,
              consuming: 3,
              since: 1420247000000
            }
          },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              }
            }]
        }]
      },
      {
        id: '225',
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
          quantity: [{
            previous: undefined,
            current: 2
          },
            {
              previous: undefined,
              current: 2
            },
            {
              previous: undefined,
              current: 2
            },
            {
              previous: 8,
              current: 10
            },
            {
              previous: 8,
              current: 10
            },
            {
              previous: 8,
              current: 10
            },
            {
              previous: 8,
              current: 10
            }]
        }, {
          metric: 'memory',
          quantity: [{
            previous: undefined,
            current: {
              consumed: 0,
              consuming: 2,
              since: 1420249000000
            }
          },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              }
            },
            {
              previous: undefined,
              current: {
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              }
            },
            {
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
            },
            {
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
            },
            {
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
            },
            {
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
            }]
        }]
      }];

    // Define the sequence of aggregated usage we're expecting for an org
    const aggregated = [{
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      accumulated_usage_id: '222',
      start: 1420245000000,
      end: 1420245000000,
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [10, 10, 10, 10, 10, 10, 12]
          }, {
            metric: 'memory',
            quantity: [{
              consumed: 0,
              consuming: 6,
              since: 1420243200000
            },
              {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
              {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
              {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
              {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
              {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
              {
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              }]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [10, 10, 10, 10, 10, 10, 12]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }]
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
              quantity: [10, 10, 10, 10, 10, 10, 12]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 0,
                consuming: 6,
                since: 1420243200000
              },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                {
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                }]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [10, 10, 10, 10, 10, 10, 12]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [10, 10, 10, 10, 10, 10, 12]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 0,
                  consuming: 6,
                  since: 1420243200000
                },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                  {
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  }]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [10, 10, 10, 10, 10, 10, 12]
                }, {
                  metric: 'memory',
                  quantity: [{
                    consumed: 0,
                    consuming: 6,
                    since: 1420243200000
                  },
                    {
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    },
                    {
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    },
                    {
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    },
                    {
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    },
                    {
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    },
                    {
                      consumed: 0,
                      consuming: 6,
                      since: 1420243200000
                    }]
                }]
              }]
            }]
          }]
        }]
    }, {
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      accumulated_usage_id: '223',
      start: 1420247000000,
      end: 1420247000000,
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [10, 10, 10, 22, 22, 22, 22]
          }, {
            metric: 'memory',
            quantity: [{
              consumed: 0,
              consuming: 4,
              since: 1420245000000
            },
              {
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              },
              {
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              },
              {
                consumed: 10800000,
                consuming: 4,
                since: 1420245000000
              },
              {
                consumed: 10800000,
                consuming: 4,
                since: 1420245000000
              },
              {
                consumed: 10800000,
                consuming: 4,
                since: 1420245000000
              },
              {
                consumed: 10800000,
                consuming: 4,
                since: 1420245000000
              }]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [10, 10, 10, 22, 22, 22, 22]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              },
                {
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                }]
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
              quantity: [10, 10, 10, 22, 22, 22, 22]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 0,
                consuming: 4,
                since: 1420245000000
              },
                {
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                },
                {
                  consumed: 10800000,
                  consuming: 4,
                  since: 1420245000000
                }]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [10, 10, 10, 22, 22, 22, 22]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                },
                  {
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  }]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [10, 10, 10, 22, 22, 22, 22]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 0,
                  consuming: 4,
                  since: 1420245000000
                },
                  {
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  },
                  {
                    consumed: 10800000,
                    consuming: 4,
                    since: 1420245000000
                  }]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [10, 10, 10, 22, 22, 22, 22]
                }, {
                  metric: 'memory',
                  quantity: [{
                    consumed: 0,
                    consuming: 4,
                    since: 1420245000000
                  },
                    {
                      consumed: 0,
                      consuming: 4,
                      since: 1420245000000
                    },
                    {
                      consumed: 0,
                      consuming: 4,
                      since: 1420245000000
                    },
                    {
                      consumed: 10800000,
                      consuming: 4,
                      since: 1420245000000
                    },
                    {
                      consumed: 10800000,
                      consuming: 4,
                      since: 1420245000000
                    },
                    {
                      consumed: 10800000,
                      consuming: 4,
                      since: 1420245000000
                    },
                    {
                      consumed: 10800000,
                      consuming: 4,
                      since: 1420245000000
                    }]
                }]
              }]
            }]
          }]
        }]
    }, {
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      accumulated_usage_id: '224',
      start: 1420249000000,
      end: 1420249000000,
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [8, 8, 18, 30, 30, 30, 30]
          }, {
            metric: 'memory',
            quantity: [{
              consumed: 0,
              consuming: 3,
              since: 1420247000000
            },
              {
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              },
              {
                consumed: 8000000,
                consuming: 7,
                since: 1420247000000
              },
              {
                consumed: 18800000,
                consuming: 7,
                since: 1420247000000
              },
              {
                consumed: 18800000,
                consuming: 7,
                since: 1420247000000
              },
              {
                consumed: 18800000,
                consuming: 7,
                since: 1420247000000
              },
              {
                consumed: 18800000,
                consuming: 7,
                since: 1420247000000
              }]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [8, 8, 18, 30, 30, 30, 30]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              },
                {
                  consumed: 0,
                  consuming: 3,
                  since: 1420247000000
                },
                {
                  consumed: 8000000,
                  consuming: 7,
                  since: 1420247000000
                },
                {
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                },
                {
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                },
                {
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                },
                {
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                }]
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
              quantity: [8, 8, 18, 30, 30, 30, 30]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 0,
                consuming: 3,
                since: 1420247000000
              },
                {
                  consumed: 0,
                  consuming: 3,
                  since: 1420247000000
                },
                {
                  consumed: 8000000,
                  consuming: 7,
                  since: 1420247000000
                },
                {
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                },
                {
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                },
                {
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                },
                {
                  consumed: 18800000,
                  consuming: 7,
                  since: 1420247000000
                }]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [8, 8, 18, 30, 30, 30, 30]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 0,
                  consuming: 3,
                  since: 1420247000000
                },
                  {
                    consumed: 0,
                    consuming: 3,
                    since: 1420247000000
                  },
                  {
                    consumed: 8000000,
                    consuming: 7,
                    since: 1420247000000
                  },
                  {
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  },
                  {
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  },
                  {
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  },
                  {
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  }]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [8, 8, 18, 30, 30, 30, 30]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 0,
                  consuming: 3,
                  since: 1420247000000
                },
                  {
                    consumed: 0,
                    consuming: 3,
                    since: 1420247000000
                  },
                  {
                    consumed: 8000000,
                    consuming: 7,
                    since: 1420247000000
                  },
                  {
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  },
                  {
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  },
                  {
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  },
                  {
                    consumed: 18800000,
                    consuming: 7,
                    since: 1420247000000
                  }]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [8, 8, 18, 30, 30, 30, 30]
                }, {
                  metric: 'memory',
                  quantity: [{
                    consumed: 0,
                    consuming: 3,
                    since: 1420247000000
                  },
                    {
                      consumed: 0,
                      consuming: 3,
                      since: 1420247000000
                    },
                    {
                      consumed: 8000000,
                      consuming: 7,
                      since: 1420247000000
                    },
                    {
                      consumed: 18800000,
                      consuming: 7,
                      since: 1420247000000
                    },
                    {
                      consumed: 18800000,
                      consuming: 7,
                      since: 1420247000000
                    },
                    {
                      consumed: 18800000,
                      consuming: 7,
                      since: 1420247000000
                    },
                    {
                      consumed: 18800000,
                      consuming: 7,
                      since: 1420247000000
                    }]
                }]
              }]
            }]
          }]
        }]
    }, {
      organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      accumulated_usage_id: '225',
      start: 1420251000000,
      end: 1420251000000,
      resources: [
        {
          resource_id: 'test-resource',
          aggregated_usage: [{
            metric: 'heavy_api_calls',
            quantity: [2, 2, 2, 32, 32, 32, 32]
          }, {
            metric: 'memory',
            quantity: [{
              consumed: 0,
              consuming: 2,
              since: 1420249000000
            },
              {
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              },
              {
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1420249000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1420249000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1420249000000
              },
              {
                consumed: 32800000,
                consuming: 6,
                since: 1420249000000
              }]
          }],
          plans: [{
            plan_id: 'basic',
            aggregated_usage: [{
              metric: 'heavy_api_calls',
              quantity: [2, 2, 2, 32, 32, 32, 32]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              },
                {
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                },
                {
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                }]
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
              quantity: [2, 2, 2, 32, 32, 32, 32]
            }, {
              metric: 'memory',
              quantity: [{
                consumed: 0,
                consuming: 2,
                since: 1420249000000
              },
                {
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                },
                {
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                },
                {
                  consumed: 32800000,
                  consuming: 6,
                  since: 1420249000000
                }]
            }],
            plans: [{
              plan_id: 'basic',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [2, 2, 2, 32, 32, 32, 32]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                },
                  {
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  },
                  {
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  },
                  {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  },
                  {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  },
                  {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  },
                  {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  }]
              }]
            }]
          }],
          consumers: [{
            consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
            resources: [{
              resource_id: 'test-resource',
              aggregated_usage: [{
                metric: 'heavy_api_calls',
                quantity: [2, 2, 2, 32, 32, 32, 32]
              }, {
                metric: 'memory',
                quantity: [{
                  consumed: 0,
                  consuming: 2,
                  since: 1420249000000
                },
                  {
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  },
                  {
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  },
                  {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  },
                  {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  },
                  {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  },
                  {
                    consumed: 32800000,
                    consuming: 6,
                    since: 1420249000000
                  }]
              }],
              plans: [{
                plan_id: 'basic',
                aggregated_usage: [{
                  metric: 'heavy_api_calls',
                  quantity: [2, 2, 2, 32, 32, 32, 32]
                }, {
                  metric: 'memory',
                  quantity: [{
                    consumed: 0,
                    consuming: 2,
                    since: 1420249000000
                  },
                    {
                      consumed: 0,
                      consuming: 2,
                      since: 1420249000000
                    },
                    {
                      consumed: 0,
                      consuming: 2,
                      since: 1420249000000
                    },
                    {
                      consumed: 32800000,
                      consuming: 6,
                      since: 1420249000000
                    },
                    {
                      consumed: 32800000,
                      consuming: 6,
                      since: 1420249000000
                    },
                    {
                      consumed: 32800000,
                      consuming: 6,
                      since: 1420249000000
                    },
                    {
                      consumed: 32800000,
                      consuming: 6,
                      since: 1420249000000
                    }]
                }]
              }]
            }]
          }]
        }]
    }];

    const verify = (secured, done) => {
      process.env.SECURED = secured ? 'true' : 'false';
      oauthspy.reset();
      reqmock.batch_post.reset();

      // Create a test aggregator app
      const app = aggregator();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Post accumulated usage to the aggregator
      let locations = {};
      const post = (done) => {

        // Post each usage doc
        transform.reduce(usage, (a, u, i, l, cb) => request.post(
          'http://localhost::p/v1/metering/accumulated/usage', {
            p: server.address().port,
            body: extend({}, u, {
              organization_id:
                ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
                  secured ? 1 : 0].join('-')
            })
          }, (err, val) => {
            expect(err).to.equal(undefined);

            // Expect a 201 with the location of the aggregated usage
            expect(val.statusCode).to.equal(201);
            expect(val.headers.location).to.not.equal(undefined);

            // Record the location returned for each usage doc
            locations[u.id] = val.headers.location;
            cb();
          }), undefined, () => {
            // Check oauth validator spy
            expect(oauthspy.callCount).to.equal(secured ? 4 : 0);

            done();
          });
      };


      // Check posts to the rating service
      const checkrating = (done) => {
        // Expect usage docs to have been posted to the rating service
        expect(reduce(reqmock.batch_post.args, (a, b) => {
          return a + reduce(b[0], (a, b) => {
            expect(b[0]).to.equal('http://localhost:9410/v1/rating/usage');
            return a + 1;
          }, 0);
        }, 0)).to.equal(4);
        done();
      };

      // Get the aggregated usage history
      const get = (done) => {
        let check;

        // Get each version of the aggregated usage
        transform.map(usage, (u, i, l, cb) =>
          brequest.get(locations[u.id], {}, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);

            // Expect our test accumulated usage ids
            expect(val.body.accumulated_usage_id).to.equal(u.id);

            // Expect our final test aggregated usage
            if (i === 3) {
              expect(omit(val.body, 'id', 'accumulated_usage_id'))
                .to.deep.equal(extend({},
                  omit(aggregated[3], 'accumulated_usage_id'), {
                    organization_id:
                      ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
                        secured ? 1 : 0].join('-')
                  }));
              check = true;
            }

            cb();
          }), () => {
            // Expect to have seen the final test aggregated usage
            expect(check).to.equal(true);

            // Check oauth validator spy
            expect(oauthspy.callCount).to.equal(secured ? 5 : 0);

            done();
          });
      };

      // Run the above steps
      post(() => checkrating(() => get(done)));
    };

    // Verify using an unsecured server and then verify using a secured server
    verify(false, () => verify(true, done));
  });
});
