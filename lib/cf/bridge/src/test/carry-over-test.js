'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const memoize = _.memoize;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

const urienv = require('abacus-urienv');

// Resolve service URIs
const uris = memoize(() => urienv({
  api      : 80,
  collector: 9080,
  db       : 5984
}));

describe('Carry-over', () => {
  let dbEnv;
  let writeSpy;
  let reqmock;
  let bridge;

  const cfToken = () => 'token';
  const abacusToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-paging')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];

    cb();
  };

  before((done) => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';

    // Delete test dbs on the configured db server
    const dbclient = require('abacus-dbclient');
    dbclient.drop(process.env.DB, /^abacus-cf-bridge-/, done);
  });

  after(() => {
    process.env.DB = dbEnv;
  });

  beforeEach(() => {
    deleteModules();

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch, retry, breaker and throttle modules
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

    // Mock the carryover module
    require('abacus-carryover');
    const carryOverMock = () => ({
      write: writeSpy
    });
    require.cache[require.resolve('abacus-carryover')].exports
      = carryOverMock;
  });

  afterEach(() => {
    if (bridge)
      bridge.stopReporting();

    deleteModules();
  });

  const appUsage = {
    total_results: 5,
    total_pages: 1,
    prev_url: null,
    next_url: null,
    resources: [
      {
        metadata: {
          guid: '904419c1',
          url: '/v2/app_usage_events/904419c1',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 0,
          instance_count: 1,
          previous_instance_count: 0,
          app_guid: '35c4ff0f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
          parent_app_guid: null,
          parent_app_name: null,
          process_type: 'web'
        }
      },
      {
        metadata: {
          guid: '904419c2',
          url: '/v2/app_usage_events/904419c2',
          created_at: '2015-08-18T11:28:21Z'
        },
        entity: {
          state: 'BUILDPACK_SET',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 2,
          previous_instance_count: 2,
          app_guid: '35c4ff0f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
          parent_app_guid: null,
          parent_app_name: null,
          process_type: 'web'
        }
      },
      {
        metadata: {
          guid: '904419c3',
          url: '/v2/app_usage_events/904419c3',
          created_at: '2015-08-18T11:28:22Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 1024,
          instance_count: 1,
          previous_instance_count: 2,
          app_guid: '35c4ff0f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
          parent_app_guid: null,
          parent_app_name: null,
          process_type: 'web'
        }
      },
      {
        metadata: {
          guid: '904419c4',
          url: '/v2/app_usage_events/904419c4',
          created_at: '2015-08-18T11:28:23Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 0,
          instance_count: 1,
          previous_instance_count: 0,
          app_guid: '35c4ff1f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
          buildpack_name: 'staticfile_buildpack',
          package_state: 'STAGED',
          previous_package_state: 'STAGED',
          parent_app_guid: null,
          parent_app_name: null,
          process_type: 'web'
        }
      },
      {
        metadata: {
          guid: '904419c5',
          url: '/v2/app_usage_events/904419c5',
          created_at: '2015-08-18T11:28:24Z'
        },
        entity: {
          state: 'BUILDPACK_SET',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 2,
          previous_instance_count: 2,
          app_guid: '35c4ff1f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
          buildpack_name: 'staticfile_buildpack',
          package_state: 'STAGED',
          previous_package_state: 'STAGED',
          parent_app_guid: null,
          parent_app_name: null,
          process_type: 'web'
        }
      },
      {
        metadata: {
          guid: '904419c6',
          url: '/v2/app_usage_events/904419c6',
          created_at: '2015-08-18T11:28:25Z'
        },
        entity: {
          state: 'STOPPED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 0,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 0,
          previous_instance_count: 1,
          app_guid: '35c4ff1f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
          buildpack_name: 'staticfile_buildpack',
          package_state: 'STAGED',
          previous_package_state: 'STAGED',
          parent_app_guid: null,
          parent_app_name: null,
          process_type: 'web'
        }
      },
      {
        metadata: {
          guid: '904419c7',
          url: '/v2/app_usage_events/904419c7',
          created_at: '2015-08-18T11:28:26Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 0,
          instance_count: 1,
          previous_instance_count: 0,
          app_guid: '35c4ff2f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
          parent_app_guid: null,
          parent_app_name: null,
          process_type: 'web'
        }
      },
      {
        metadata: {
          guid: '904419c8',
          url: '/v2/app_usage_events/904419c8',
          created_at: '2015-08-18T11:28:27Z'
        },
        entity: {
          state: 'STOPPED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 0,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 0,
          previous_instance_count: 1,
          app_guid: '35c4ff0f',
          app_name: 'app',
          space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          space_name: 'diego',
          org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
          parent_app_guid: null,
          parent_app_name: null,
          process_type: 'web'
        }
      }
    ]
  };

  context('on success', () => {
    beforeEach((done) => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(null, { statusCode: 200, body: appUsage });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, {
            statusCode: 201,
            body: {},
            headers: { location: uris().collector +
            '/v1/metering/collected/usage/t/20161010/k/anonymous' }
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      writeSpy = spy((usage, response, cb) => {
        cb(undefined);
      });

      bridge = require('..');
      bridge.reportingConfig.minInterval = 5;
      bridge.reportAppUsage(cfToken, abacusToken, {
        failure: (error, response) => {
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %s and response %j', error, response)));
        },
        success: () => {
          bridge.stopReporting();
          done();
        }
      });
    });

    it('inserts in carry-over db', () => {
      expect(writeSpy.callCount).to.equal(6);
    });
  });

  context('on failure storing carry-over usage', () => {
    const testError = new Error();

    beforeEach((done) => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(null, { statusCode: 200, body: appUsage });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, {
            statusCode: 201,
            body: {},
            headers: { location: uris().collector +
            '/v1/metering/collected/usage/t/20161010/k/anonymous' }
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      writeSpy = spy((usage, response, cb) => {
        cb(testError, {});
      });

      bridge = require('..');
      bridge.reportingConfig.minInterval = 5;
      bridge.reportAppUsage(cfToken, abacusToken, {
        failure: (error) => {
          expect(error).to.equal(testError);

          bridge.stopReporting();
          done();
        },
        success: () => {
          done(new Error('Unexpected call of success'));
        }
      });
    });

    it('does not update carry-over db', () => {
      expect(writeSpy.callCount).to.equal(1);
    });
  });

});
