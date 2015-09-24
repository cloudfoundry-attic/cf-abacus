'use strict';

const _ = require('underscore');
const extend = _.extend;
const clone = _.clone;

const util = require('util');

// Configure API URL
process.env.API = 'http://api';

describe('CF app usage read', () => {
  let reqmock;

  beforeEach(() => {
    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Mock the batch module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

    // Mock the oauth token
    require('../oauth.js');
    require.cache[require.resolve('../oauth.js')].exports.getToken =
      () => 'token';
  });

  afterEach(() => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../oauth.js')];
    delete require.cache[require.resolve('../paging.js')];
  });

  context('on non-empty usage event stream', () => {
    const appUsagePageOne = {
      total_results: 2,
      total_pages: 2,
      prev_url: null,
      next_url: '/page2',
      resources: [
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
        },
        {
          metadata: {
            guid: '904419c5',
            url: '/v2/app_usage_events/904419c5',
            created_at: '2015-08-18T11:28:20Z'
          },
          entity: {
            state: 'STARTED',
            memory_in_mb_per_instance: 512,
            instance_count: 1,
            app_guid: '35c4ff1f',
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

    const appUsagePageTwo = {
      total_results: 1,
      total_pages: 1,
      prev_url: null,
      next_url: null,
      resources: [
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
            app_guid: '35c4ff2f',
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

    let bridge;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend(clone(request), {
        get: spy((uri, opts, cb) => {
          if (opts.page.indexOf('page2') > -1)
            cb(null, {statusCode: 200, body: appUsagePageTwo});
          else
            cb(null, {statusCode: 200, body: appUsagePageOne});
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      bridge = require('..');
    });

    const checkRequest = (expectedAPIOption, expectedURL, req) => {
      expect(req[1]).to.contain.all.keys('api', 'page', 'headers');
      expect(req[1].api).to.equal(expectedAPIOption);
      expect(req[1].page).to.equal(expectedURL);
    };

    it('generates correct usage request', function(done) {
      bridge.readUsage((error, response) => {
        done(new Error(util.format('Unexpected error %s and response code %s',
          error, response)));
      });

      setTimeout(() => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkRequest('http://api', '/v2/app_usage_events?' +
          'order-direction=asc&results-per-page=50', args[0]);
        checkRequest('http://api', '/page2', args[1]);

        done();
      }, 200);
    });

    const checkAppPresent = (guid, resource) => {
      expect(bridge.cache.appUsage).to.contain.key(guid);
      expect(bridge.cache.appUsage[guid][0]).to.eql(resource);
    };

    it('stores correct usage data', function(done) {
      bridge.readUsage();

      setTimeout(() => {
        checkAppPresent('35c4ff0f', appUsagePageOne.resources[0]);
        checkAppPresent('35c4ff1f', appUsagePageOne.resources[1]);
        checkAppPresent('35c4ff2f', appUsagePageTwo.resources[0]);

        done();
      }, 200);
    });
  });

  context('on empty usage event stream', () => {
    const appUsage = {
      total_results: 0,
      total_pages: 1,
      prev_url: null,
      next_url: null,
      resources: []
    };

    let bridge;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend(clone(request), {
        get: spy((uri, opts, cb) => {
          cb(null, {statusCode: 200, body: appUsage});
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      bridge = require('..');
    });

    it('does not report app usage', function(done) {
      bridge.readUsage((error, response) => {
        done(new Error(util.format('Unexpected error %s and response code %s',
          error, response)));
      });

      setTimeout(() => {
        const usage = bridge.cache.appUsage;
        const numberAppsReported = Object.keys(usage).length;
        expect(numberAppsReported).to.equal(0);

        done();
      }, 200);
    });
  });

  context('on failure', () => {
    let bridge;
    let expectedError;
    let expectedStatusCode;

    const checkError = (done) => {
      return (err, response) => {
        expect(err).to.equal(expectedError);
        if (expectedStatusCode)
          expect(response.statusCode).to.equal(expectedStatusCode);
        done();
      };
    };

    afterEach(() => {
      bridge = undefined;
      expectedError = undefined;
      expectedStatusCode = undefined;
    });

    context('on error fetching usage', () => {
      beforeEach(() => {
        expectedError = 'error';

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend(clone(request), {
          get: spy((uri, opts, cb) => {
            cb('error', {});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
      });

      it('errors', function(done) {
        bridge.readUsage(checkError(done));
      });
    });

    context('on unauthorized', () => {
      beforeEach(() => {
        expectedError = null;
        expectedStatusCode = 401;

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend(clone(request), {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 401 });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
      });

      it('errors', function(done) {
        bridge.readUsage(checkError(done));
      });
    });

    context('on missing OAuth Token', () => {
      beforeEach(() => {
        expectedError = 'Missing token';

        bridge = require('..');

        // Mock oauth token
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => undefined;
      });

      it('errors', function(done) {
        bridge.readUsage(checkError(done));
      });
    });
  });

  context('usage event listing', () => {
    const appUsage = {
      total_results: 1,
      total_pages: 1,
      prev_url: null,
      next_url: null,
      resources: [
        {
          metadata: {
            guid: '904419c4',
            url: '/v2/app_usage_events/904419c4',
            created_at: new Date().toISOString()
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
    let bridge;

    context('when we just recorded guid', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend(clone(request), {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at =
              new Date(new Date().getTime() - 5000).toISOString();
            cb(null, {statusCode: 200, body: appUsage});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.cache.lastRecordedGUID = null;
      });

      it('does not update last recorded guid', function(done) {
        bridge.readUsage();

        setTimeout(() => {
          expect(bridge.cache.lastRecordedGUID).to.equal(null);
          done();
        }, 200);
      });
    });

    context('when we recorded the guid far back in time', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend(clone(request), {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at =
              new Date(new Date().getTime() - 600000).toISOString();
            cb(null, {statusCode: 200, body: appUsage});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.cache.lastRecordedGUID = null;
      });

      it('updates last recorded guid', function(done) {
        bridge.readUsage();

        setTimeout(() => {
          expect(bridge.cache.lastRecordedGUID).to.equal('904419c4');
          done();
        });
      });
    });
  });

});
