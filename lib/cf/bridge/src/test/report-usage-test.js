'use strict';

const _ = require('underscore');
const extend = _.extend;
const clone = _.clone;

const util = require('util');

// Configure COLLECTOR URL
process.env.COLLECTOR = 'http://collector';

describe('Report usage', () => {
  let reqmock;
  let bridge;
  let expectedError;
  let expectedStatusCode;
  let expectedUsageRequest;
  let expectedAppUsage;

  const checkUsageReport = (done) => {
    return (err, response) => {
      expect(err).to.equal(expectedError);
      if (expectedStatusCode)
        expect(response.statusCode).to.equal(expectedStatusCode);

      const args = reqmock.post.args;

      expect(args.length).to.equal(1);
      expect(args[0][0]).to.equal(':collector/v1/metering/resource/usage');

      expect(args[0][1]).to.contain.all.keys('collector', 'body');
      expect(args[0][1].collector).to.equal('http://collector');

      expect(args[0][1].body).to.contain.all.keys('usage');
      expect(args[0][1].body.usage.length).to.equal(1);

      if (expectedUsageRequest)
        expect(args[0][1].body.usage[0]).to.deep.equal(expectedUsageRequest);

      if (expectedAppUsage)
        expect(bridge.cache.appUsage).to.deep.equal(expectedAppUsage);

      done();
    };
  };

  beforeEach(() => {
    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Mock the batch module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);
  });

  afterEach(() => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../oauth.js')];
    delete require.cache[require.resolve('../paging.js')];

    bridge = undefined;
    expectedError = undefined;
    expectedStatusCode = undefined;
    expectedUsageRequest = undefined;
    expectedAppUsage = undefined;
  });

  context('on success', () => {
    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend(clone(request), {
        post: spy((uri, opts, cb) => {
          cb(null, {statusCode: 201, body: {}});
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;
    });

    context('for empty app usage', () => {
      const appUsage = {};

      beforeEach(() => {
        bridge = require('..');
        bridge.cache.appUsage = clone(appUsage);
      });

      it('does not report app usage event', function(done) {
        bridge.reportAppUsage((error, response) => {
          done(new Error(util.format('Unexpected error %s and response code %s',
            error, response)));
        });

        setTimeout(() => {
          expect(reqmock.post.args.length).to.equal(0);
          done();
        }, 100);
      });
    });

    context('for started app', () => {
      const appUsage = {
        '35c4ff0f': [
          {
            metadata: {
              guid: '904419c4',
              url: '/v2/app_usage_events/904419c4',
              created_at: '2015-08-18T11:28:20Z'
            },
            entity: {
              state: 'STARTED',
              memory_in_mb_per_instance: 512,
              instance_count: 1,
              app_guid: '35c4ff0f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'diego',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web'
            }
          }
        ]
      };

      beforeEach(() => {
        expectedError = null;
        expectedStatusCode = 201;
        expectedUsageRequest = {
          start: 1439897300000,
          end: 1439897300000,
          region: 'eu-gb',
          organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          resource_id: 'linux-container',
          plan_id: 'basic',
          resource_instance_id: '35c4ff0f',
          measured_usage: [
            {
              measure: 'instance_memory',
              quantity: 536870912
            },
            {
              measure: 'running_instances',
              quantity: 1
            }
          ]
        };
        expectedAppUsage = {};

        bridge = require('..');
        bridge.cache.appUsage = clone(appUsage);
      });

      it('reports app usage event', function(done) {
        bridge.reportAppUsage(checkUsageReport(done));
      });
    });

    context('for stopped app', () => {
      const appUsage = {
        '35c4ff0f': [
          {
            metadata: {
              guid: '904419c4',
              url: '/v2/app_usage_events/904419c4',
              created_at: '2015-08-18T11:28:20Z'
            },
            entity: {
              state: 'STOPPED',
              memory_in_mb_per_instance: 512,
              instance_count: 1,
              app_guid: '35c4ff0f',
              app_name: 'app',
              space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
              space_name: 'diego',
              org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
              buildpack_guid: null,
              buildpack_name: null,
              package_state: 'PENDING',
              parent_app_guid: null,
              parent_app_name: null,
              process_type: 'web'
            }
          }
        ]
      };

      beforeEach(() => {
        expectedError = null;
        expectedStatusCode = 201;
        expectedUsageRequest = {
          start: 1439897300000,
          end: 1439897300000,
          region: 'eu-gb',
          organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
          space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
          resource_id: 'linux-container',
          plan_id: 'basic',
          resource_instance_id: '35c4ff0f',
          measured_usage: [
            {
              measure: 'instance_memory',
              quantity: 0
            },
            {
              measure: 'running_instances',
              quantity: 0
            }
          ]
        };
        expectedAppUsage = {};

        bridge = require('..');
        bridge.cache.appUsage = clone(appUsage);
      });


      it('reports app usage event', function(done) {
        bridge.reportAppUsage(checkUsageReport(done));
      });
    });
  });

  context('on bad response code', () => {
    const appUsage = {
      '35c4ff0f': [
        {
          metadata: {
            guid: '904419c4',
            url: '/v2/app_usage_events/904419c4',
            created_at: '2015-08-18T11:28:20Z'
          },
          entity: {
            state: 'STOPPED',
            memory_in_mb_per_instance: 512,
            instance_count: 1,
            app_guid: '35c4ff0f',
            app_name: 'app',
            space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
            space_name: 'diego',
            org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
            buildpack_guid: null,
            buildpack_name: null,
            package_state: 'PENDING',
            parent_app_guid: null,
            parent_app_name: null,
            process_type: 'web'
          }
        }
      ]
    };

    beforeEach(() => {
      expectedError = null;
      expectedStatusCode = 500;
      expectedAppUsage = clone(appUsage);

      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend(clone(request), {
        post: spy((uri, opts, cb) => {
          cb(null, {statusCode: 500, body: {}});
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      bridge = require('..');
      bridge.cache.appUsage = clone(appUsage);
    });

    it('errors', function(done) {
      bridge.reportAppUsage(checkUsageReport(done));
    });
  });

  context('on error reporting usage', () => {
    const appUsage = {
      '35c4ff0f': [
        {
          metadata: {
            guid: '904419c4',
            url: '/v2/app_usage_events/904419c4',
            created_at: '2015-08-18T11:28:20Z'
          },
          entity: {
            state: 'STOPPED',
            memory_in_mb_per_instance: 512,
            instance_count: 1,
            app_guid: '35c4ff0f',
            app_name: 'app',
            space_guid: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
            space_name: 'diego',
            org_guid: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
            buildpack_guid: null,
            buildpack_name: null,
            package_state: 'PENDING',
            parent_app_guid: null,
            parent_app_name: null,
            process_type: 'web'
          }
        }
      ]
    };

    beforeEach(() => {
      expectedError = 'error';
      expectedUsageRequest = {
        start: 1439897300000,
        end: 1439897300000,
        region: 'eu-gb',
        organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
        space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
        resource_id: 'linux-container',
        plan_id: 'basic',
        resource_instance_id: '35c4ff0f',
        measured_usage: [
          {
            measure: 'instance_memory',
            quantity: 0
          },
          {
            measure: 'running_instances',
            quantity: 0
          }
        ]
      };
      expectedAppUsage = clone(appUsage);

      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend(clone(request), {
        post: spy((uri, opts, cb) => {
          cb('error', {});
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      bridge = require('..');
      bridge.cache.appUsage = clone(appUsage);
    });

    it('errors', function(done) {
      bridge.reportAppUsage(checkUsageReport(done));
    });
  });
});
