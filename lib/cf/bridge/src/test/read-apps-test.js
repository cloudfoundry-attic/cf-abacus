'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;

// Configure API URL
process.env.API = 'http://api';

let sandbox;

describe('CF apps read', () => {
  let reqMock;

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-paging')];
    delete require.cache[require.resolve('..')];
  };

  beforeEach(() => {
    deleteModules();

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Mock the batch module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

    // Stub timeout with immediate
    sandbox = sinon.sandbox.create();
    sandbox.stub(global, 'setTimeout', setImmediate);
  });

  afterEach(() => {
    sandbox.restore();

    deleteModules();

    reqMock = undefined;
  });

  const token = () => 'token';

  const appsListPageOne = {
    total_results: 2,
    total_pages: 2,
    prev_url: null,
    next_url: '/page2',
    resources: [
      {
        metadata: {
          guid: '1409b17e',
          url: '/v2/apps/1409b17e',
          created_at: '2015-09-15T12:43:52Z',
          updated_at: '2015-09-15T12:44:01Z'
        },
        entity: {
          name: 'app1',
          production: false,
          space_guid: 'cf639c05-b275-48ae-8b1f-b56ff84d53c6',
          stack_guid: '767e546f-d75b-4b9f-91d6-3f2084dbd494',
          buildpack: null,
          detected_buildpack: 'Static file',
          environment_json: {},
          memory: 256,
          instances: 1,
          disk_quota: 1024,
          state: 'STARTED',
          version: '42fad4bf-89d3-4bf7-b989-fe79d596c587',
          command: null,
          console: false,
          debug: null,
          staging_task_id: 'b6fd702d0ec64b068b4a949e0437be25',
          package_state: 'STAGED',
          health_check_type: 'port',
          health_check_timeout: null,
          staging_failed_reason: null,
          staging_failed_description: null,
          diego: false,
          docker_image: null,
          package_updated_at: '2015-09-15T12:43:54Z',
          detected_start_command: 'sh boot.sh',
          enable_ssh: true,
          docker_credentials_json: {
            redacted_message: '[PRIVATE DATA HIDDEN]'
          },
          space_url: '/v2/spaces/cf639c05-b275-48ae-8b1f-b56ff84d53c6',
          stack_url: '/v2/stacks/767e546f-d75b-4b9f-91d6-3f2084dbd494',
          events_url: '/v2/apps/1409b17e/events',
          service_bindings_url: '/v2/apps/1409b17e/service_bindings',
          routes_url: '/v2/apps/1409b17e/routes'
        }
      }
    ]
  };

  const appsListPageTwo = {
    total_results: 1,
    total_pages: 1,
    prev_url: '/page1',
    next_url: null,
    resources: [
      {
        metadata: {
          guid: 'a8bbf5d0',
          url: '/v2/apps/a8bbf5d0',
          created_at: '2015-09-15T12:55:01Z',
          updated_at: '2015-09-15T12:55:11Z'
        },
        entity: {
          name: 'app2',
          production: false,
          space_guid: 'cf639c05-b275-48ae-8b1f-b56ff84d53c6',
          stack_guid: '767e546f-d75b-4b9f-91d6-3f2084dbd494',
          buildpack: null,
          detected_buildpack: 'Static file',
          environment_json: {},
          memory: 256,
          instances: 1,
          disk_quota: 1024,
          state: 'STARTED',
          version: 'fd0d38af-c130-4359-b5e2-5ac3726bf146',
          command: null,
          console: false,
          debug: null,
          staging_task_id: '9bb654f49f734c5bbdaadc27403a4b0f',
          package_state: 'STAGED',
          health_check_type: 'port',
          health_check_timeout: null,
          staging_failed_reason: null,
          staging_failed_description: null,
          diego: false,
          docker_image: null,
          package_updated_at: '2015-09-15T12:55:05Z',
          detected_start_command: 'sh boot.sh',
          enable_ssh: true,
          docker_credentials_json: {
            redacted_message: '[PRIVATE DATA HIDDEN]'
          },
          space_url: '/v2/spaces/cf639c05-b275-48ae-8b1f-b56ff84d53c6',
          stack_url: '/v2/stacks/767e546f-d75b-4b9f-91d6-3f2084dbd494',
          events_url: '/v2/apps/a8bbf5d0/events',
          service_bindings_url: '/v2/apps/a8bbf5d0/service_bindings',
          routes_url: '/v2/apps/a8bbf5d0/routes'
        }
      }
    ]
  };

  context('on non-empty apps list', () => {
    let bridge;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqMock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          if (opts.page.indexOf('page2') > -1)
            cb(null, { statusCode: 200, body: appsListPageTwo });
          else
            cb(null, { statusCode: 200, body: appsListPageOne });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqMock;

      bridge = require('..');
    });

    const checkRequest = (expectedAPIOption, expectedURL, req) => {
      expect(req[1]).to.contain.all.keys('api', 'page', 'headers');
      expect(req[1].api).to.equal(expectedAPIOption);
      expect(req[1].page).to.equal(expectedURL);
    };

    it('generates correct list request', (done) => {
      bridge.fetchCFApps(token, {
        success: () => {
          const args = reqMock.get.args;
          expect(args.length).to.equal(2);
          checkRequest('http://api', '/v2/apps?order-direction=asc&' +
            'results-per-page=50', args[0]);
          checkRequest('http://api', '/page2', args[1]);

          done();
        },
        failure: (error, response) => {
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %o and response %j', error, response)));
        }
      });
    });

    it('stores correct apps', (done) => {
      bridge.fetchCFApps(token, {
        success: () => {
          expect(bridge.cache.apps).to.contain('1409b17e');
          expect(bridge.cache.apps).to.contain('a8bbf5d0');

          done();
        },
        failure: (error, response) => {
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %o and response %j', error, response)));
        }
      });
    });
  });

  context('on empty apps stream', () => {
    const appsList = {
      total_results: 2,
      total_pages: 2,
      prev_url: null,
      next_url: null,
      resources: []
    };

    let bridge;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqMock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(null, { statusCode: 200, body: appsList });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqMock;

      bridge = require('..');
    });

    it('does not store any app usage', (done) => {
      bridge.fetchCFApps(token, {
        success: () => {
          expect(bridge.cache.apps.length).to.equal(0);
          done();
        },
        failure: (error, response) => {
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %o and response %j', error, response)));
        }
      });
    });
  });

  context('when listing apps fails', () => {
    let bridge;
    let returnError;
    let clock;

    beforeEach(() => {
      returnError = true;

      // Fake timer
      clock = sinon.useFakeTimers(Date.now());
    });

    afterEach(() => {
      if (bridge)
        bridge.stopReporting();
      if (clock)
        clock.restore();
    });

    context('when there is an error', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqMock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (returnError)
              cb('error', null);
            else
              cb(null, { statusCode: 200, body: appsListPageTwo });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqMock;

        bridge = require('..');
      });

      it('retries', (done) => {
        bridge.fetchCFApps(token, {
          failure: (error, response) => {
            expect(error).to.equal('error');
            expect(response).to.equal(null);
            expect(bridge.cache.apps.length).to.equal(0);

            expect(returnError).to.equal(true);
            returnError = false;

            // Run pending timers - force retry to trigger
            clock.tick(bridge.compensationConfig.minInterval);
          },
          success: () => {
            expect(returnError).to.equal(false);
            expect(bridge.cache.apps).to.contain('a8bbf5d0');
            done();
          }
        });
      });
    });

    context('when bad response is returned', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqMock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (returnError)
              cb(null, { statusCode: 500, body: null });
            else
              cb(null, { statusCode: 200, body: appsListPageTwo });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqMock;

        bridge = require('..');
      });

      it('retries', (done) => {
        bridge.fetchCFApps(token, {
          failure: (error, response) => {
            expect(error).to.equal(null);
            expect(response).not.to.equal(null);
            expect(response.statusCode).to.equal(500);

            expect(bridge.cache.apps.length).to.equal(0);

            expect(returnError).to.equal(true);
            returnError = false;

            // Run pending timers - force retry to trigger
            clock.tick(bridge.compensationConfig.minInterval);
          },
          success: () => {
            expect(returnError).to.equal(false);
            expect(bridge.cache.apps).to.contain('a8bbf5d0');
            done();
          }
        });
      });
    });
  });

});
