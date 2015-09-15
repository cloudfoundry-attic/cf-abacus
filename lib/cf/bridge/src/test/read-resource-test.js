'use strict';

const _ = require('underscore');
const extend = _.extend;
const clone = _.clone;

// Configure API URL
process.env.API = 'http://api.com';

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
  });

  afterEach(() => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('..')];
  });

  context('on non-empty usage event stream', () => {
    const appUsagePageOne = {
      total_results: 1,
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

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend(clone(request), {
        get: spy((uri, opts, cb) => {
          if (uri.indexOf('page2') > -1)
            cb(null, {statusCode: 200, body: appUsagePageTwo});
          else
            cb(null, {statusCode: 200, body: appUsagePageOne});
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      bridge = require('..');
      bridge.settings.oauthToken = 'token';
    });

    const checkRequest = (expectedAPIOption, expectedURL, req) => {
      expect(req[0]).to.equal(expectedURL);
      expect(req[1]).to.contain.all.keys('api', 'headers');
      expect(req[1].api).to.equal(expectedAPIOption);
      expect(req[1].headers).to.contain.all.keys('Authorization');
      expect(req[1].headers.Authorization).to.equal('token');
    };

    const performCheck = (done) => {
      return (err, response) => {
        expect(err).to.equal(null);
        expect(response).not.to.equal(null);
        expect(response.statusCode).to.equal(200);

        const expectedURLPage1 = ':api/v2/app_usage_events?' +
          'order-direction=asc&results-per-page=50';
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkRequest('http://api.com', expectedURLPage1, args[0]);
        checkRequest('http://api.com', ':api/page2', args[1]);

        const appUsage = bridge.settings.appUsage['35c4ff0f'];
        expect(appUsage[0]).to.eql(appUsagePageOne.resources[0]);
        expect(appUsage[1]).to.eql(appUsagePageTwo.resources[0]);

        done();
      };
    };

    it('reports app usage', function(done) {
      bridge.readUsage(performCheck(done));
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
      bridge.settings.oauthToken = 'token';
    });

    const performCheck = (done) => {
      return (err, response) => {
        expect(err).to.equal(null);
        expect(response).not.to.equal(null);
        expect(response.statusCode).to.equal(200);

        const usage = bridge.settings.appUsage;
        const numberAppsReported = Object.keys(usage).length;
        expect(numberAppsReported).to.equal(0);

        done();
      };
    };

    it('does not report app usage', function(done) {
      bridge.readUsage(performCheck(done));
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
        expectedError = 'FailedToFetchUsage';

        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend(clone(request), {
          get: spy((uri, opts, cb) => {
            cb('error', {});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.settings.oauthToken = 'token';
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
        bridge.settings.oauthToken = 'token';
      });

      it('errors', function(done) {
        bridge.readUsage(checkError(done));
      });
    });

    context('on missing OAuth Token', () => {
      beforeEach(() => {
        expectedError = 'MissingToken';

        bridge = require('..');
        bridge.settings.oauthToken = null;
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
    let timestamp;
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
      bridge.settings.oauthToken = 'token';
    });

    context('when we just recorded guid', () => {
      beforeEach(() => {
        timestamp = new Date().getTime() - 5000;
        bridge.lastRecorded.guid = null;
        bridge.lastRecorded.timestamp = timestamp;
      });

      it('does not update last recorded guid', function(done) {
        bridge.readUsage(() => {
          expect(bridge.lastRecorded.guid).to.equal(null);
          expect(bridge.lastRecorded.timestamp).to.equal(timestamp);

          done();
        });
      });
    });

    context('when we recorded the guid far back in time', () => {
      beforeEach(() => {
        timestamp = new Date().getTime() - 600000;
        bridge.lastRecorded.guid = null;
        bridge.lastRecorded.timestamp = timestamp;
      });

      it('updates last recorded guid', function(done) {
        bridge.readUsage(() => {
          expect(bridge.lastRecorded.guid).to.equal('904419c4');
          expect(bridge.lastRecorded.timestamp).not.to.equal(timestamp);

          done();
        });
      });
    });
  });

});
