'use strict';

/* eslint-disable no-unused-expressions */

const moment = require('abacus-moment');

const _ = require('underscore');
const extend = _.extend;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

const tests = (secured) => {
  let dbEnv;
  let reqmock;
  let bridge;
  let clock;
  let sandbox;

  const cfToken = () => 'token';
  const abacusToken = () => 'token';

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-carryover')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-paging')];
    delete require.cache[require.resolve('abacus-client')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];
  };

  const cleanDB = (done) => {
    // Delete test dbs on the configured db server
    const dbclient = require('abacus-dbclient');
    dbclient.drop(process.env.DB, /^abacus-cf-bridge-/, () => {
      dbclient.drop(process.env.DB, /^abacus-carry-over-/, done);
    });
  };

  before(() => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';
  });

  after(() => {
    process.env.DB = dbEnv;
  });

  beforeEach((done) => {
    deleteModules();

    process.env.SECURED = secured ? 'true' : 'false';

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

    sandbox = sinon.sandbox.create();

    cleanDB(done);
  });

  afterEach(() => {
    if (bridge)
      bridge.stopReporting();
    if (clock)
      clock.restore();

    bridge = undefined;

    deleteModules();

    // Unset the SECURED variable
    delete process.env.SECURED;
    sandbox.restore();
  });

  const eventTimeStamp = 1439897300000;

  const generateUsageReport = (appId, currentInstanceMemory,
     currentInstances, previousInstanceMemory, previousInstances) => ({
       start: eventTimeStamp,
       end: eventTimeStamp,
       organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
       space_id: 'f057fe03-0713-4896-94c7-24b71c6882c2',
       consumer_id: `app:${appId}`,
       resource_id: 'linux-container',
       plan_id: 'standard',
       resource_instance_id: `memory:${appId}`,
       measured_usage: [
         {
           measure: 'current_instance_memory',
           quantity: currentInstanceMemory
         },
         {
           measure: 'current_running_instances',
           quantity: currentInstances
         },
         {
           measure: 'previous_instance_memory',
           quantity: previousInstanceMemory
         },
         {
           measure: 'previous_running_instances',
           quantity: previousInstances
         }
       ]
     });

  const checkUsageReport = (done, appId, currentInstanceMemory,
                            currentInstances, previousInstanceMemory,
                            previousInstances) => {
    const args = reqmock.post.args;
    expect(args.length).to.equal(1);
    expect(args[0][0]).to.equal(':collector/v1/metering/collected/usage');
    expect(args[0][1]).to.contain.all.keys('collector', 'body');
    expect(args[0][1].collector).to.equal('http://collector');
    expect(args[0][1].body).to.deep.equal(
      generateUsageReport(appId,
                          currentInstanceMemory, currentInstances,
                          previousInstanceMemory, previousInstances));
    done();
  };

  const expectError = (bridge, expectedError, expectedResponse, done) => {
    return {
      failure: (error, response) => {
        if (bridge)
          bridge.stopReporting();
        if (error instanceof Error)
          expect(error.message).to.equal(expectedError);
        else
          expect(error).to.equal(expectedError);
        expect(response).to.deep.equal(expectedResponse);
        done();
      },
      success: () => {
        bridge.stopReporting();
        done(new Error('Unexpected call of success'));
      }
    };
  };

  const appUsagePageOne = {
    total_results: 4,
    total_pages: 2,
    prev_url: null,
    next_url: '/page2',
    resources: [
      {
        metadata: {
          guid: '1',
          url: '/v2/app_usage_events/1',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STOPPED',
          memory_in_mb_per_instance: 1024,
          previous_memory_in_mb_per_instance: 1024,
          instance_count: 2,
          previous_instance_count: 2,
          app_guid: 'f3a07a06',
          app_name: 'abacus-eureka-plugin',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'PENDING',
          previous_package_state: 'PENDING',
          parent_app_guid: 'f3a07a06-fe7c-49ef-bcf5-b830eb3b21b3',
          parent_app_name: 'abacus-eureka-plugin',
          process_type: 'web'
        }
      },
      {
        metadata: {
          guid: '2',
          url: '/v2/app_usage_events/2',
          created_at: '2015-08-18T11:28:21Z'
        },
        entity: {
          state: 'STAGING_STARTED',
          previous_state: 'STAGING',
          memory_in_mb_per_instance: 1024,
          previous_memory_in_mb_per_instance: 1024,
          instance_count: 1,
          previous_instance_count: 1,
          app_guid: '',
          app_name: '',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          buildpack_guid: null,
          buildpack_name: null,
          package_state: 'READY',
          previous_package_state: 'READY',
          parent_app_guid: 'f3a07a06',
          parent_app_name: 'abacus-eureka-plugin',
          process_type: null,
          task_name: null,
          task_guid: null
        }
      },
      {
        metadata: {
          guid: '3',
          url: '/v2/app_usage_events/3',
          created_at: '2015-08-18T11:28:22Z'
        },
        entity: {
          state: 'STAGING_STOPPED',
          previous_state: 'STAGING',
          memory_in_mb_per_instance: 1024,
          previous_memory_in_mb_per_instance: 1024,
          instance_count: 1,
          previous_instance_count: 1,
          app_guid: '',
          app_name: '',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          buildpack_guid: null,
          buildpack_name: 'https://hub.com/cloudfoundry/nodejs-buildpack.git',
          package_state: 'READY',
          previous_package_state: 'READY',
          parent_app_guid: 'f3a07a06',
          parent_app_name: 'abacus-eureka-plugin',
          process_type: null,
          task_name: null,
          task_guid: null
        }
      },
      {
        metadata: {
          guid: '4',
          url: '/v2/app_usage_events/4',
          created_at: '2015-08-18T11:28:23Z'
        },
        entity: {
          state: 'BUILDPACK_SET',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 1024,
          previous_memory_in_mb_per_instance: 1024,
          instance_count: 2,
          previous_instance_count: 2,
          app_guid: 'f3a07a06',
          app_name: 'abacus-eureka-plugin',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          buildpack_guid: '30429b05-745e-4474-a39f-267afa365d69',
          buildpack_name: 'https://hub.com/cloudfoundry/nodejs-buildpack.git',
          package_state: 'STAGED',
          previous_package_state: 'UNKNOWN',
          parent_app_guid: 'f3a07a06-fe7c-49ef-bcf5-b830eb3b21b3',
          parent_app_name: 'abacus-eureka-plugin',
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
          guid: '904419c6',
          url: '/v2/app_usage_events/904419c4',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 256,
          instance_count: 1,
          previous_instance_count: 2,
          app_guid: '35c4ff2f',
          app_name: 'app',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
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
  const appUsagePageWithEqualCreatedAt = {
    total_results: 2,
    total_pages: 1,
    prev_url: null,
    next_url: null,
    resources: [
      {
        metadata: {
          guid: '904419c1',
          url: '/v2/app_usage_events/904419c1',
          created_at: '2015-08-18T13:30:20Z'
        },
        entity: {
          state: 'STOPPED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 1,
          previous_instance_count: 1,
          app_guid: '35c4ff2f',
          app_name: 'app',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6',
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
          created_at: '2015-08-18T13:30:20Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STOPPED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 1,
          previous_instance_count: 1,
          app_guid: '35c4ff2f',
          app_name: 'app',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6',
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
          created_at: '2015-08-18T13:30:20Z'
        },
        entity: {
          state: 'STOPPED',
          previous_state: 'STARTED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 1,
          previous_instance_count: 1,
          app_guid: '35c4ff2f',
          app_name: 'app',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6',
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
          created_at: '2015-08-18T13:30:21Z'
        },
        entity: {
          state: 'STARTED',
          previous_state: 'STOPPED',
          memory_in_mb_per_instance: 512,
          previous_memory_in_mb_per_instance: 512,
          instance_count: 1,
          previous_instance_count: 1,
          app_guid: '35c4ff2f',
          app_name: 'app',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6',
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

  const mockRequestModule = () => {
    const request = require('abacus-request');
    reqmock = extend({}, request, {
      get: spy((uri, opts, cb) => {
        if (opts.page.indexOf('page2') > -1)
          cb(null, { statusCode: 200, body: appUsagePageTwo });
        else
          cb(null, { statusCode: 200, body: appUsagePageOne });
      }),
      post: spy((uri, opts, cb) => {
        cb(null, {
          statusCode: 201,
          body: {},
          headers: { location: 'some location' }
        });
      })
    });
    require.cache[require.resolve('abacus-request')].exports = reqmock;
  };

  const reportAppUsage = (done) => {
    bridge = require('..');
    bridge.reportingConfig.minInterval = 5000;
    bridge.reportAppUsage(cfToken, abacusToken, {
      failure: (error, response) => {
        bridge.stopReporting();
        done(new Error('Unexpected call of failure with ' +
          `error ${error} and response ${response}`));
      },
      success: () => {
        bridge.stopReporting();
        done();
      }
    });
  };

  const checkCacheStats = (stats, change) => {
    expect(stats).to.deep.equal(extend({
      readSuccess: 0,
      readFailure: 0,
      writeSuccess: 0,
      writeFailure: 0
    }, change));
  };

  const checkPagingStats = (stats, change) => {
    expect(stats).to.deep.equal(extend({
      pageReadSuccess: 0,
      pageReadFailures: 0,
      pageProcessSuccess: 0,
      pageProcessFailures: 0,
      pageProcessEnd: 0,
      missingToken: 0
    }, change));
  };

  const checkUsageStats = (stats, change) => {
    expect(stats).to.deep.equal(extend({
      reportFailures: 0,
      reportSuccess: 0,
      reportBusinessError: 0,
      reportConflict: 0,
      loopFailures: 0,
      loopSuccess: 0,
      loopConflict: 0,
      loopSkip: 0,
      missingToken: 0
    }, change));
  };

  const checkCarryOverStats = (stats, change) => {
    expect(stats).to.deep.equal(extend({
      getSuccess: 0,
      getNotFound: 0,
      getFailure: 0,
      removeSuccess: 0,
      removeFailure: 0,
      upsertSuccess: 0,
      upsertFailure: 0,
      readSuccess: 0,
      readFailure: 0,
      docsRead: 0
    }, change));
  };

  context('on non-empty usage event stream', () => {
    context('with multiple pages', () => {
      beforeEach((done) => {
        mockRequestModule();

        reportAppUsage(done);
      });

      const checkGetRequest = (expectedAPIOption, expectedURL, req) => {
        expect(req[1]).to.contain.all.keys('api', 'page', 'headers');
        expect(req[1].api).to.equal(expectedAPIOption);
        expect(req[1].page).to.equal(expectedURL);
      };

      it('gets app usage events from API', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest('http://api', '/v2/app_usage_events?' +
          'order-direction=asc&results-per-page=50', args[0]);
        checkGetRequest('http://api', '/page2', args[1]);
      });

      const checkPostRequest = (req, appId,
                                currentMemory, currentInstances,
                                previousMemory, previousInstances) => {
        expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
        expect(req[1]).to.contain.all.keys('collector', 'body');
        expect(req[1].collector).to.equal('http://collector');
        expect(req[1].body).to.deep.equal(
          generateUsageReport(appId,
            currentMemory, currentInstances,
            previousMemory, previousInstances));
      };

      it('reports resource usage to COLLECTOR', () => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(2);
        checkPostRequest(args[0], 'f3a07a06', 1073741824, 2, 0, 0);
        checkPostRequest(args[1], '35c4ff2f', 536870912, 1, 268435456, 2);
      });

      it('populates paging statistics', () => {
        checkPagingStats(bridge.statistics.paging, {
          pageReadSuccess: 1,
          pageProcessSuccess: 5,
          pageProcessEnd: 2
        });
      });

      it('populates usage statistics', () => {
        checkUsageStats(bridge.statistics.usage, {
          reportSuccess: 2,
          loopSuccess: 2,
          loopSkip: 3
        });
      });

      it('populates carry-over statistics', () => {
        checkCarryOverStats(bridge.statistics.carryOver, {
          getNotFound: 4,
          upsertSuccess: 2
        });
      });
    });

    context('with single page', () => {
      context('for starting app', () => {
        beforeEach((done) => {
          // Deep-clone page two
          const appUsagePage = JSON.parse(JSON.stringify(appUsagePageTwo));
          const resourceEntity = appUsagePage.resources[0].entity;
          resourceEntity.previous_state = 'STOPPED';
          resourceEntity.previous_instance_count = 0;
          resourceEntity.previous_memory_in_mb_per_instance = 0;

          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePage });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, {
                statusCode: 201,
                body: {},
                headers: { location: 'some location' }
              });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          reportAppUsage(done);
        });

        it('reports app usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 536870912, 1, 0, 0);
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            pageReadSuccess: 1,
            pageProcessSuccess: 1,
            pageProcessEnd: 1
          });
        });

        it('populates usage statistics', () => {
          checkUsageStats(bridge.statistics.usage, {
            reportSuccess: 1,
            loopSuccess: 1
          });
        });

        it('populates carry-over statistics', () => {
          checkCarryOverStats(bridge.statistics.carryOver, {
            getNotFound: 2,
            upsertSuccess: 1
          });
        });
      });

      context('for scaling app', () => {
        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, {
                statusCode: 201,
                body: {},
                headers: { location: 'some location' }
              });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          reportAppUsage(done);
        });

        it('reports app usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 536870912, 1, 268435456, 2);
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            pageReadSuccess: 1,
            pageProcessSuccess: 1,
            pageProcessEnd: 1
          });
        });

        it('populates usage statistics', () => {
          checkUsageStats(bridge.statistics.usage, {
            reportSuccess: 1,
            loopSuccess: 1
          });
        });

        it('populates carry-over statistics', () => {
          checkCarryOverStats(bridge.statistics.carryOver, {
            getNotFound: 2,
            upsertSuccess: 1
          });
        });
      });

      context('for stopping app', () => {
        beforeEach((done) => {
          // Deep-clone page two
          const appUsagePage = JSON.parse(JSON.stringify(appUsagePageTwo));
          const resourceEntity = appUsagePage.resources[0].entity;
          resourceEntity.state = 'STOPPED';

          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePage });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, {
                statusCode: 201,
                body: {},
                headers: { location: 'some location' }
              });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          reportAppUsage(done);
        });

        it('reports app usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 0, 0, 268435456, 2);
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            pageReadSuccess: 1,
            pageProcessSuccess: 1,
            pageProcessEnd: 1
          });
        });

        it('populates usage statistics', () => {
          checkUsageStats(bridge.statistics.usage, {
            reportSuccess: 1,
            loopSuccess: 1
          });
        });

        it('populates carry-over statistics', () => {
          checkCarryOverStats(bridge.statistics.carryOver, {
            getNotFound: 2,
            upsertSuccess: 1
          });
        });
      });
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

    let returnEmptyPage;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          if (returnEmptyPage)
            cb(null, { statusCode: 200, body: appUsage });
          else
            if (opts.page.indexOf('page2') > -1)
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            else
              cb(null, { statusCode: 200, body: appUsagePageOne });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, {
            statusCode: 201,
            body: {},
            headers: { location: 'some location' }
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      bridge = require('..');

      returnEmptyPage = true;

      // Fake timer
      clock = sinon.useFakeTimers(moment.utc().valueOf());
    });

    it('does not report app usage', (done) => {
      bridge.reportAppUsage(cfToken, abacusToken, {
        failure: (error, response) => {
          bridge.stopReporting();
          done(new Error('Unexpected call of failure with ' +
            `error ${error} and response ${response}`));
        },
        success: () => {
          bridge.stopReporting();
          expect(reqmock.post.args.length).to.equal(0);
          done();
        }
      });
    });

    it('continues reporting on new app usage', (done) => {
      bridge.reportAppUsage(cfToken, abacusToken, {
        failure: (error, response) => {
          bridge.stopReporting();
          done(new Error('Unexpected call of failure with ' +
            `error ${error} and response ${response}`));
        },
        success: () => {
          if (returnEmptyPage) {
            returnEmptyPage = false;
            expect(reqmock.post.args.length).to.equal(0);

            // Run pending timers - force retry to trigger
            clock.tick(bridge.reportingConfig.minInterval);
          }
          else {
            bridge.stopReporting();
            expect(reqmock.post.args.length).to.equal(2);
            done();
          }
        }
      });
    });
  });

  context('on failure', () => {
    context('getting usage from CF, errors', () => {
      context('on fetching usage', () => {
        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb('error', {});
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(bridge, 'error', {}, done));
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            pageReadFailures: 1
          });
        });

        it('does not change usage statistics', () => {
          checkUsageStats(bridge.statistics.usage);
        });

        it('does not change carry-over statistics', () => {
          checkCarryOverStats(bridge.statistics.carryOver);
        });
      });

      context('when unauthorized', () => {
        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 401 });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(bridge, null, { statusCode: 401 }, done));
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            pageReadFailures: 1
          });
        });

        it('does not change usage statistics', () => {
          checkUsageStats(bridge.statistics.usage);
        });

        it('does not change carry-over statistics', () => {
          checkCarryOverStats(bridge.statistics.carryOver);
        });
      });

      context('with missing CF oAuth Token', () => {
        beforeEach((done) => {
          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(() => undefined, abacusToken,
            expectError(bridge, 'Missing CF token', undefined, done));
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            missingToken: 1
          });
        });

        it('populates usage statistics', () => {
          checkUsageStats(bridge.statistics.usage);
        });

        it('does not change carry-over statistics', () => {
          checkCarryOverStats(bridge.statistics.carryOver);
        });
      });
    });

    context('posting usage to Abacus', () => {
      context('on bad response code', () => {
        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 500, body: {} });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(bridge,
              'Failed reporting usage. Consecutive failures: 1',
              { statusCode: 500, body: {} },
              done));
        });

        it('increases the retry count', () => {
          expect(bridge.reportingConfig.currentRetries).to.equal(1);
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            pageProcessFailures: 1
          });
        });

        it('populates usage statistics', () => {
          checkUsageStats(bridge.statistics.usage, {
            reportFailures: 1,
            loopFailures: 1
          });
        });

        it('populates carry-over statistics', () => {
          checkCarryOverStats(bridge.statistics.carryOver, {
            getNotFound: 1
          });
        });
      });

      context('on business error', () => {
        context('on 409 response code', () => {
          beforeEach((done) => {
            // Mock the request module
            const request = require('abacus-request');
            reqmock = extend({}, request, {
              get: spy((uri, opts, cb) => {
                cb(null, { statusCode: 200, body: appUsagePageTwo });
              }),
              post: spy((uri, opts, cb) => {
                cb(null, { statusCode: 409, body: {
                  error: 'conflict',
                  reason: 'Conflict? Please retry'
                } });
              })
            });
            require.cache[require.resolve('abacus-request')].exports = reqmock;

            reportAppUsage(done);
          });

          it('populates paging statistics', () => {
            checkPagingStats(bridge.statistics.paging, {
              pageReadSuccess: 1,
              pageProcessSuccess: 1,
              pageProcessEnd: 1
            });
          });

          it('populates usage statistics', () => {
            checkUsageStats(bridge.statistics.usage, {
              reportBusinessError: 1,
              reportConflict: 1,
              loopConflict: 1
            });
          });

          it('populates carry-over statistics', () => {
            checkCarryOverStats(bridge.statistics.carryOver, {
              getNotFound: 1
            });
          });
        });

        context('on 409 response code with noretry', () => {
          beforeEach((done) => {
            // Mock the request module
            const request = require('abacus-request');
            reqmock = extend({}, request, {
              get: spy((uri, opts, cb) => {
                cb(null, { statusCode: 200, body: appUsagePageTwo });
              }),
              post: spy((uri, opts, cb) => {
                cb(null, { statusCode: 409, body: {
                  error: 'conflict',
                  reason: 'Conflict! Do not retry',
                  noretry: true
                } });
              })
            });
            require.cache[require.resolve('abacus-request')].exports = reqmock;

            reportAppUsage(done);
          });

          it('populates paging statistics', () => {
            checkPagingStats(bridge.statistics.paging, {
              pageReadSuccess: 1,
              pageProcessSuccess: 1,
              pageProcessEnd: 1
            });
          });

          it('populates usage statistics', () => {
            checkUsageStats(bridge.statistics.usage, {
              reportBusinessError: 1,
              reportConflict: 1,
              loopConflict: 1
            });
          });

          it('populates carry-over statistics', () => {
            checkCarryOverStats(bridge.statistics.carryOver, {
              getNotFound: 1
            });
          });
        });

        context('on 201 response code', () => {
          beforeEach((done) => {
            const errorBody = {
              error: 'emplannotfound',
              reason: 'Metering plan for the metering plan id ' +
              'complex-object-storage is not found',
              cause: {
                statusCode: 404
              }
            };

            // Mock the request module
            const request = require('abacus-request');
            reqmock = extend({}, request, {
              get: spy((uri, opts, cb) => {
                cb(null, { statusCode: 200, body: appUsagePageTwo });
              }),
              post: spy((uri, opts, cb) => {
                cb(null, {
                  statusCode: 201,
                  headers: { location: 'some location' },
                  body: errorBody
                });
              })
            });
            require.cache[require.resolve('abacus-request')].exports = reqmock;

            bridge = require('..');
            bridge.reportingConfig.minInterval = 5000;
            bridge.reportAppUsage(cfToken, abacusToken, {
              failure: (error, response) => {
                bridge.stopReporting();

                expect(error).to.deep.equal(errorBody);
                expect(response.statusCode).to.equal(201);

                done();
              },
              success: () => {
                bridge.stopReporting();
                done(new Error('Unexpected call of success'));
              }
            });
          });

          it('populates paging statistics', () => {
            checkPagingStats(bridge.statistics.paging, {
              pageProcessFailures: 1
            });
          });

          it('populates usage statistics', () => {
            checkUsageStats(bridge.statistics.usage, {
              reportFailures: 1,
              reportBusinessError: 1,
              loopFailures: 1
            });
          });

          it('populates carry-over statistics', () => {
            checkCarryOverStats(bridge.statistics.carryOver, {
              getNotFound: 1
            });
          });
        });

        context('on 500 response code with noretry', () => {
          beforeEach((done) => {
            const errorBody = {
              error: 'internal',
              reason: 'Network connectivity problem'
            };

            // Mock the request module
            const request = require('abacus-request');
            reqmock = extend({}, request, {
              get: spy((uri, opts, cb) => {
                cb(null, { statusCode: 200, body: appUsagePageTwo });
              }),
              post: spy((uri, opts, cb) => {
                cb(null, {
                  statusCode: 500,
                  headers: { location: 'some location' },
                  body: errorBody
                });
              })
            });
            require.cache[require.resolve('abacus-request')].exports = reqmock;

            bridge = require('..');
            bridge.reportingConfig.minInterval = 5000;
            bridge.reportAppUsage(cfToken, abacusToken, {
              failure: (error, response) => {
                bridge.stopReporting();

                expect(error).to.deep.equal(errorBody);
                expect(response.statusCode).to.equal(500);

                done();
              },
              success: () => {
                done(new Error('Unexpected call of success'));
              }
            });
          });

          it('populates paging statistics', () => {
            checkPagingStats(bridge.statistics.paging, {
              pageProcessFailures: 1
            });
          });

          it('populates usage statistics', () => {
            checkUsageStats(bridge.statistics.usage, {
              reportFailures: 1,
              reportBusinessError: 1,
              loopFailures: 1
            });
          });

          it('populates carry-over statistics', () => {
            checkCarryOverStats(bridge.statistics.carryOver, {
              getNotFound: 1
            });
          });
        });
      });

      context('on error', () => {
        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb('error', {});
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken,
            expectError(bridge, 'error', {}, done));
        });

        it('increases the retry count', () => {
          expect(bridge.reportingConfig.currentRetries).to.equal(1);
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            pageProcessFailures: 1
          });
        });

        it('populates usage statistics', () => {
          checkUsageStats(bridge.statistics.usage, {
            reportFailures: 1,
            loopFailures: 1
          });
        });

        it('populates carry-over statistics', () => {
          checkCarryOverStats(bridge.statistics.carryOver, {
            getNotFound: 1
          });
        });
      });

      context('when there are several failed requests', () => {
        beforeEach(() => {
          mockRequestModule();

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportingConfig.currentRetries = 1;
        });

        it('resets the retry count on successful request', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, {
            success: () => {
              bridge.stopReporting();

              expect(bridge.reportingConfig.currentRetries).to.equal(0);
              done();
            },
            failure: (error, response) => {
              bridge.stopReporting();
              done(new Error('Unexpected call of failure with ' +
                `error ${error}, response ${response}`));
            }
          });
        });
      });

      context('when after_guid is not recognized', () => {
        let returnError = false;

        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              if (returnError)
                cb(null, {
                  statusCode: 400,
                  body: {
                    code: 10005,
                    description: 'The query parameter is invalid'
                  }
                });
              else
                cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, {
                statusCode: 201,
                body: {},
                headers: { location: 'some location' }
              });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken, {
            success: () => {
              bridge.stopReporting();
              // Make spy return an invalid query error
              returnError = true;
              done();
            },
            failure: (error, response) => {
              bridge.stopReporting();
              done(new Error('Unexpected call of failure with ' +
                `error ${error} and response ${response}`));
            }
          });
        });

        it('resets the last processed data', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              bridge.stopReporting();

              expect(error).to.equal(null);
              expect(response).to.deep.equal({
                statusCode: 400,
                body: {
                  code: 10005,
                  description: 'The query parameter is invalid'
                }
              });

              expect(bridge.cache.lastRecordedGUID).to.equal(undefined);
              expect(bridge.cache.lastRecordedTimestamp).to.equal(undefined);
              done();
            },
            success: () => {
              bridge.stopReporting();
              done(new Error('Unexpected call of success'));
            }
          });
        });
      });

      context('with missing oAuth resource token', () => {
        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, {
                statusCode: 201,
                body: {},
                headers: { location: 'some location' }
              });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
        });

        it('errors if token needed ', (done) => {
          if (secured)
            bridge.reportAppUsage(cfToken, () => undefined,
              expectError(bridge, 'Missing resource provider token',
                null, done));
          else
            bridge.reportAppUsage(cfToken, () => undefined, {
              failure: (error, response) => {
                bridge.stopReporting();
                done(new Error('Unexpected call of failure with ' +
                  `error ${error} and response ${response}`));
              }, success: () => {
                bridge.stopReporting();
                done();
              }
            });
        });
      });

      context('with missing Location header', () => {
        const resource = appUsagePageTwo.resources[0].entity;
        const expectedErrorMessage = 'No Location header found' +
          ' in response { statusCode: 201, body: {} } for usage ' +
          generateUsageReport(resource.app_guid,
            resource.memory_in_mb_per_instance * 1024 * 1024,
            resource.instance_count,
            resource.previous_memory_in_mb_per_instance * 1024 * 1024,
            resource.previous_instance_count);

        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 201, body: {} });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
        });

        it('returns error', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, {
            success: () => {
              bridge.stopReporting();
              done(new Error('Unexpected call of success'));
            },
            failure: (error) => {
              bridge.stopReporting();
              expect(error).to.deep.equal(new Error(expectedErrorMessage));
              done();
            }
          });
        });

        it('increases the retry count', (done) => {
          bridge.reportAppUsage(cfToken, abacusToken, {
            success: () => {
              bridge.stopReporting();
              done(new Error('Unexpected call of success'));
            },
            failure: () => {
              bridge.stopReporting();
              expect(bridge.reportingConfig.currentRetries).to.equal(1);
              done();
            }
          });
        });
      });

      context('when cache cannot be updated', () => {
        const expectedCacheError = new Error('cache update problem');

        let failRequest = true;
        let result;

        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, {
                statusCode: 201,
                body: {},
                headers: { location: 'some location' }
              });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          // Mock the dbclient module
          const dbclient = require('abacus-dbclient');
          const dbclientModule = require.cache[
            require.resolve('abacus-dbclient')
          ];
          dbclientModule.exports = () => {
            return {
              fname: 'test-mock',
              get: (doc, cb) => {
                cb(undefined, doc);
              },
              put: (doc, cb) => {
                cb(undefined, doc);
              },
              remove: (doc, cb) => {
                cb(undefined, doc);
              },
              bulkDocs: (docs, opt, cb) => {
                if (failRequest)
                  cb(expectedCacheError, undefined);
                else
                  cb(undefined, docs);
              },
              allDocs: (opt, cb) => {
                cb(undefined, { rows: [] });
              }
            };
          };
          dbclientModule.exports.dburi = dbclient.dburi;
          dbclientModule.exports.tkuri = dbclient.tkuri;

          bridge = require('..');
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              bridge.stopReporting();
              result = { error, response };
              done();
            },
            success: () => {
              bridge.stopReporting();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('errors', () => {
          expect(result.error).to.deep.equal(expectedCacheError);
          expect(result.response).to.equal(undefined);
        });

        it('populates cache statistics', () => {
          checkCacheStats(bridge.statistics.cache, {
            writeFailure: 1
          });
        });

        it('does not alter timestamp when sending to COLLECTOR', (done) => {
          failRequest = false;

          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              bridge.stopReporting();
              done(new Error('Unexpected call of failure with error' +
                ` ${error} and response ${response}`));
            },
            success: () => {
              bridge.stopReporting();

              expect(reqmock.post.args.length).to.equal(2);
              const secondPostBody = reqmock.post.secondCall.args[1].body;
              expect(secondPostBody).to.not.equal(undefined);
              expect(secondPostBody.start).to.equal(eventTimeStamp);

              done();
            }
          });
        });
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
            guid: '904419c6ddba',
            url: '/v2/app_usage_events/904419c4',
            created_at: '0'
          },
          entity: {
            state: 'STARTED',
            memory_in_mb_per_instance: 512,
            instance_count: 1,
            app_guid: '35c4ff0f',
            app_name: 'app',
            space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
            space_name: 'abacus',
            org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
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
      const date = moment.utc(moment.now() - 5000).toISOString();

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at = date;
            cb(null, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              body: {},
              headers: { location: 'some location' }
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.reportingConfig.minInterval = 5000;
      });

      it('does not update last recorded data', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            bridge.stopReporting();
            done(new Error('Unexpected call of failure with ' +
              `error ${error} and response ${response}`));
          },
          success: () => {
            bridge.stopReporting();

            expect(bridge.cache.lastRecordedGUID).to.equal(undefined);
            expect(bridge.cache.lastRecordedTimestamp).to.equal(undefined);
            expect(bridge.statistics.usage.loopSkip).to.equal(1);
            done();
          }
        });
      });
    });

    context('when we recorded the guid far back in time', () => {
      const date = moment.utc(moment.now() - 600000).toISOString();

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at = date;
            cb(null, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              body: {},
              headers: { location: 'some location' }
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.reportingConfig.minInterval = 5000;
      });

      it('updates last recorded data', (done) => {
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            bridge.stopReporting();
            done(new Error('Unexpected call of failure with ' +
              `error ${error} and response ${response}`));
          },
          success: () => {
            bridge.stopReporting();

            expect(bridge.cache.lastRecordedGUID).to.equal('904419c6ddba');
            expect(bridge.cache.lastRecordedTimestamp).to.equal(date);
            expect(bridge.statistics.usage.loopSkip).to.equal(0);
            done();
          }
        });
      });
    });

    context('when report usage is called again', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            appUsage.resources[0].metadata.created_at =
              moment.utc(moment.now() - 600000).toISOString();
            cb(null, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              body: {},
              headers: { location: 'some location' }
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        bridge.reportingConfig.minInterval = 5;
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            bridge.stopReporting();
            done(new Error('Unexpected call of failure with ' +
              `error ${error} and response ${response}`));
          },
          success: () => {
            bridge.stopReporting();

            // Call reporting second time
            bridge.reportAppUsage(cfToken, abacusToken, {
              failure: (error, response) => {
                bridge.stopReporting();
                done(new Error('Unexpected call of failure with ' +
                  `error ${error} and response ${response}`));
              },
              success: () => {
                bridge.stopReporting();
                done();
              }
            });
          }
        });
      });

      it('uses the last recorded GUID', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);

        expect(args[1][1]).to.contain.key('page');
        expect(args[1][1].page).to.contain('after_guid=904419c6ddba');
      });
    });
  });

  context('when bridge is stopped', () => {
    beforeEach(() => {
      mockRequestModule();
    });

    it('stored last recorded GUID and timestamp', (done) => {
      // Store GUID in DB
      bridge = require('..');
      bridge.reportingConfig.minInterval = 5000;
      bridge.initCache(() => {
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            bridge.stopReporting();
            done(new Error('Unexpected call of failure with ' +
              `error ${error} and response ${response}`));
          },
          success: () => {
            bridge.stopReporting();
            deleteModules();

            expect(bridge.cache.lastRecordedGUID).
              to.equal('904419c6');
            expect(bridge.cache.lastRecordedTimestamp).
              to.equal('2015-08-18T11:28:20Z');

            done();
          }
        });
      });
    });
  });

  context('when token is missing', () => {
    let setReportingTimeout = null;

    beforeEach(() =>{
      bridge = require('..');
      setReportingTimeout = bridge.setReportingTimeout;
      bridge.setReportingTimeout = () => {};
    });

    afterEach(() => {
      bridge.setReportingTimeout = setReportingTimeout;
    });

    it('should update missing token status', function(done) {
      if(!secured)
        this.skip();

      const startTime = moment.now();
      bridge.reportAppUsage(null, () => null, {
        success: () => {
          bridge.stopReporting();
          done(new Error('Unexpected call of success'));
        },
        failure: (err, resp) => {
          bridge.stopReporting();
          expect(err).to.equal('Missing resource provider token');
          expect(resp).to.equal(null);
          expect(bridge.errors.missingToken).to.equal(true);
          expect(bridge.errors.lastError)
            .to.equal('Missing resource provider token');
          let errorTime = moment.utc(bridge.errors.lastErrorTimestamp)
            .valueOf();
          expect(errorTime).to.be.at.least(startTime);
          done();
        }
      });
    });
  });

  context('when token is no more missing', () => {
    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(null, {
            statusCode: 200,
            body: {},
            headers: { location: 'some location' }
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      bridge = require('..');
      bridge.errors.missingToken = true;
    });

    it('should update missing token status', (done) => {
      bridge.reportAppUsage(cfToken, abacusToken, {
        success: () => {
          bridge.stopReporting();
          expect(bridge.errors.missingToken).to.equal(false);
          done();
        },
        failure: (err, resp) => {
          bridge.stopReporting();
          done(new Error('Unexpected call of failure with ' +
            `error ${err} and response ${resp}`));
        }
      });
    });
  });

  context('when reporting error conditions', () => {

    context('and no report ever happened', () => {
      beforeEach(() => {
        bridge = require('..');
      });

      it('noReportEverHappened should be true', (done) => {
        expect(bridge.errors.noReportEverHappened).to.equal(true);
        expect(bridge.errors.lastError).to.equal('');
        expect(bridge.errors.lastErrorTimestamp).to.equal('');
        done();
      });
    });

    context('and there are successful reports', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              body: {},
              headers: { location: 'some location' }
            });
          }),
          get: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 200,
              body: appUsagePageTwo
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;
        bridge = require('..');

        bridge.errors.consecutiveReportFailures = 5;
      });

      it('noReportEverHappened should be false', (done) => {
        expect(bridge.errors.noReportEverHappened).to.equal(true);
        bridge.reportAppUsage(cfToken, abacusToken, {
          success: () => {
            bridge.stopReporting();
            expect(bridge.errors.noReportEverHappened).to.equal(false);
            expect(bridge.errors.lastError).to.equal('');
            expect(bridge.errors.lastErrorTimestamp).to.equal('');
            done();
          },
          failure: (err, resp) => {
            bridge.stopReporting();
            done(new Error('Unexpected call of failure with ' +
              `error ${err} and response ${resp}`));
          }
        });
      });

      it('consecutiveFailures should be 0', (done) => {
        expect(bridge.errors.consecutiveReportFailures).to.equal(5);
        bridge.reportAppUsage(cfToken, abacusToken, {
          success: () => {
            bridge.stopReporting();
            expect(bridge.errors.consecutiveReportFailures).to.equal(0);
            expect(bridge.errors.lastError).to.equal('');
            expect(bridge.errors.lastErrorTimestamp).to.equal('');
            done();
          },
          failure: (err, resp) => {
            bridge.stopReporting();
            done(new Error('Unexpected call of failure with ' +
              `error ${err} and response ${resp}`));
          } });
      });
    });

    context('and there are consecutive failures', () => {

      const testFailure = (expectedFailures, cb) => {
        const startTime = moment.now();

        bridge.reportAppUsage(cfToken, abacusToken, {
          success: () => {
            bridge.stopReporting();
            cb(new Error('Unexpected call of success'));
          },
          failure: () => {
            bridge.stopReporting();
            expect(bridge.errors.consecutiveReportFailures).
              to.equal(expectedFailures);
            expect(bridge.errors.lastError).to.equal('Error reporting usage; ' +
              'error: Failed to post report; response: {}');
            let errorTime = moment.utc(bridge.errors.lastErrorTimestamp)
              .valueOf();
            expect(errorTime).to.be.at.least(startTime);
            cb();
          }
        });
      };

      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          post: spy((uri, opts, cb) => {
            cb('Failed to post report', {});
          }),
          get: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 200,
              body: appUsagePageTwo
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        bridge = require('..');
        testFailure(1, done);
      });

      it('should increment consecutiveFailures', (done) => {
        testFailure(2, done);
      });
    });
  });

  context('when two consecutive events have the same time', () => {
    let request;

    beforeEach((done) => {
      request = require('abacus-request');
      sandbox.stub(request, 'get').yields(undefined, {
        statusCode: 200,
        body: appUsagePageWithEqualCreatedAt
      });
      sandbox.stub(request, 'post').yields(undefined, {
        statusCode: 201,
        headers: { location: 'some location' },
        body: {}
      });

      cleanDB(() => {
        bridge = require('..');
        bridge.reportingConfig.minInterval = 5000;
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            bridge.stopReporting();
            done(new Error('Unexpected call of failure with error' +
              ` ${error} and response ${response}`));
          },
          success: () => {
            bridge.stopReporting();
            done();
          }
        });
      });
    });

    it('reports resource usage to COLLECTOR', () => {
      expect(request.post.callCount).to.equal(4);
      expect(request.post.getCall(0).args[1].body).include({
        start: 1439904620000,
        end:   1439904620000,
        organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6'
      });
      expect(request.post.getCall(1).args[1].body).include({
        start: 1439904620001,
        end:   1439904620001,
        organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6'
      });
      expect(request.post.getCall(2).args[1].body).include({
        start: 1439904620002,
        end:   1439904620002,
        organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6'
      });
      expect(request.post.getCall(3).args[1].body).include({
        start: 1439904621000,
        end:   1439904621000,
        organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6'
      });
    });

    it('populates paging statistics', () => {
      checkPagingStats(bridge.statistics.paging, {
        pageReadSuccess: 1,
        pageProcessSuccess: 4,
        pageProcessEnd: 1
      });
    });

    it('populates usage statistics', () => {
      checkUsageStats(bridge.statistics.usage, {
        reportSuccess: 4,
        loopSuccess: 4
      });
    });

    it('change carry-over statistics', () => {
      checkCarryOverStats(bridge.statistics.carryOver, {
        getSuccess: 6,
        getNotFound: 2,
        upsertSuccess: 4
      });
    });
  });
};

describe('Report app usage without security', () => tests(false));

describe('Report app usage with security', () => tests(true));
