'use strict';

const util = require('util');
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
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];
  };

  before((done) => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';

    // Delete test dbs on the configured db server
    const dbclient = require('abacus-dbclient');
    dbclient.drop(process.env.DB, /^abacus-cf-bridge-/, () => {
      dbclient.drop(process.env.DB, /^abacus-carry-over-/, done);
    });
  });

  after(() => {
    process.env.DB = dbEnv;
  });

  beforeEach(() => {
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
  });

  const generateUsageReport = (appId, currentInstanceMemory,
                               currentInstances, previousInstanceMemory,
                               previousInstances) => {
    return {
      start: 1439897300000,
      end: 1439897300000,
      organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
      space_id: 'f057fe03-0713-4896-94c7-24b71c6882c2',
      consumer_id: 'app:' + appId,
      resource_id: 'linux-container',
      plan_id: 'standard',
      resource_instance_id: 'memory:' + appId,
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
    };
  };

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
          created_at: '2015-08-18T11:28:20Z'
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
          created_at: '2015-08-18T11:28:20Z'
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
          created_at: '2015-08-18T11:28:20Z'
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

  context('on non-empty usage event stream', () => {
    context('with multiple pages', () => {
      beforeEach((done) => {
        // Mock the request module
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

        bridge = require('..');
        bridge.reportingConfig.minInterval = 5000;
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            bridge.stopReporting();
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          },
          success: () => {
            bridge.stopReporting();
            done();
          }
        });
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
        expect(bridge.statistics.paging.pageReadSuccess).to.equal(1);
        expect(bridge.statistics.paging.pageReadFailures).to.equal(0);
        expect(bridge.statistics.paging.pageProcessSuccess).to.equal(5);
        expect(bridge.statistics.paging.pageProcessFailures).to.equal(0);
        expect(bridge.statistics.paging.pageProcessEnd).to.equal(2);
      });

      it('populates usage statistics', () => {
        expect(bridge.statistics.usage.reportFailures).to.equal(0);
        expect(bridge.statistics.usage.reportSuccess).to.equal(2);
        expect(bridge.statistics.usage.reportConflict).to.equal(0);
        expect(bridge.statistics.usage.loopFailures).to.equal(0);
        expect(bridge.statistics.usage.loopSuccess).to.equal(2);
        expect(bridge.statistics.usage.loopConflict).to.equal(0);
        expect(bridge.statistics.usage.loopSkip).to.equal(3);
      });

      it('populates carry-over statistics', () => {
        expect(bridge.statistics.carryOver.getSuccess).to.equal(2);
        expect(bridge.statistics.carryOver.getFailure).to.equal(0);
        expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
        expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
        expect(bridge.statistics.carryOver.upsertSuccess).to.equal(2);
        expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
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

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              bridge.stopReporting();
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %j and response %j', error, response)));
            },
            success: () => {
              bridge.stopReporting();
              done();
            }
          });
        });

        it('reports app usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 536870912, 1, 0, 0);
        });

        it('populates paging statistics', () => {
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(1);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(1);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(1);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(0);
          expect(bridge.statistics.usage.reportSuccess).to.equal(1);
          expect(bridge.statistics.usage.reportConflict).to.equal(0);
          expect(bridge.statistics.usage.loopFailures).to.equal(0);
          expect(bridge.statistics.usage.loopSuccess).to.equal(1);
          expect(bridge.statistics.usage.loopConflict).to.equal(0);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(1);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(1);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
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

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              bridge.stopReporting();
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %j and response %j', error, response)));
            },
            success: () => {
              bridge.stopReporting();
              done();
            }
          });
        });

        it('reports app usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 536870912, 1, 268435456, 2);
        });

        it('populates paging statistics', () => {
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(1);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(1);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(1);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(0);
          expect(bridge.statistics.usage.reportSuccess).to.equal(1);
          expect(bridge.statistics.usage.reportConflict).to.equal(0);
          expect(bridge.statistics.usage.loopFailures).to.equal(0);
          expect(bridge.statistics.usage.loopSuccess).to.equal(1);
          expect(bridge.statistics.usage.loopConflict).to.equal(0);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(1);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(1);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
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

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: (error, response) => {
              bridge.stopReporting();
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %j and response %j', error, response)));
            },
            success: () => {
              bridge.stopReporting();
              done();
            }
          });
        });

        it('reports app usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 0, 0, 268435456, 2);
        });

        it('populates paging statistics', () => {
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(1);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(1);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(1);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(0);
          expect(bridge.statistics.usage.reportSuccess).to.equal(1);
          expect(bridge.statistics.usage.reportConflict).to.equal(0);
          expect(bridge.statistics.usage.loopFailures).to.equal(0);
          expect(bridge.statistics.usage.loopSuccess).to.equal(1);
          expect(bridge.statistics.usage.loopConflict).to.equal(0);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(1);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(1);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
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

    let bridge;
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

      // Mock the dbclient module
      const dbclient = require('abacus-dbclient');
      const dbclientModule =
        require.cache[require.resolve('abacus-dbclient')];
      dbclientModule.exports = extend(() => {
        return {
          fname: 'test-mock',
          get: (key, cb) => {
            cb(undefined, {});
          },
          put: (doc, cb) => {
            cb(undefined, {});
          },
          remove: (doc, cb) => {
            cb(undefined, {});
          }
        };
      }, dbclient);

      bridge = require('..');

      returnEmptyPage = true;

      // Fake timer
      clock = sinon.useFakeTimers(moment.utc().valueOf());
    });

    it('does not report app usage', (done) => {
      bridge.reportAppUsage(cfToken, abacusToken, {
        failure: (error, response) => {
          bridge.stopReporting();
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %j and response %j', error, response)));
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
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %j and response %j', error, response)));
        },
        success: () => {
          if (returnEmptyPage) {
            returnEmptyPage = false;
            expect(reqmock.post.args.length).to.equal(0);

            // Run pending timers - force retry to trigger
            clock.tick(bridge.compensationConfig.minInterval);
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
    let bridge;

    afterEach(() => {
      bridge = undefined;
    });

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
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(1);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(0);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(0);
          expect(bridge.statistics.usage.reportSuccess).to.equal(0);
          expect(bridge.statistics.usage.reportConflict).to.equal(0);
          expect(bridge.statistics.usage.loopFailures).to.equal(0);
          expect(bridge.statistics.usage.loopSuccess).to.equal(0);
          expect(bridge.statistics.usage.loopConflict).to.equal(0);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
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
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(1);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(0);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(0);
          expect(bridge.statistics.usage.reportSuccess).to.equal(0);
          expect(bridge.statistics.usage.reportConflict).to.equal(0);
          expect(bridge.statistics.usage.loopFailures).to.equal(0);
          expect(bridge.statistics.usage.loopSuccess).to.equal(0);
          expect(bridge.statistics.usage.loopConflict).to.equal(0);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
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
          expect(bridge.statistics.paging.missingToken).to.equal(1);
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(0);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(0);
          expect(bridge.statistics.usage.reportSuccess).to.equal(0);
          expect(bridge.statistics.usage.reportConflict).to.equal(0);
          expect(bridge.statistics.usage.loopFailures).to.equal(0);
          expect(bridge.statistics.usage.loopSuccess).to.equal(0);
          expect(bridge.statistics.usage.loopConflict).to.equal(0);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
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
            expectError(bridge, null, { statusCode: 500, body: {} }, done));
        });

        it('increases the retry count', () => {
          expect(bridge.reportingConfig.currentRetries).to.equal(1);
        });

        it('populates paging statistics', () => {
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(1);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(0);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(1);
          expect(bridge.statistics.usage.reportSuccess).to.equal(0);
          expect(bridge.statistics.usage.reportConflict).to.equal(0);
          expect(bridge.statistics.usage.loopFailures).to.equal(1);
          expect(bridge.statistics.usage.loopSuccess).to.equal(0);
          expect(bridge.statistics.usage.loopConflict).to.equal(0);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
        });
      });

      context('on 409 response code', () => {
        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: appUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 409, body: {} });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportAppUsage(cfToken, abacusToken, {
            failure: () => {
              done(new Error('Unexpected call of failure'));
            },
            success: () => {
              bridge.stopReporting();
              done();
            }
          });
        });

        it('increases the conflict count', () => {
          expect(bridge.statistics.usage.reportConflict).to.equal(1);
        });

        it('populates paging statistics', () => {
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(1);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(1);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(1);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(0);
          expect(bridge.statistics.usage.reportSuccess).to.equal(0);
          expect(bridge.statistics.usage.reportConflict).to.equal(1);
          expect(bridge.statistics.usage.loopFailures).to.equal(0);
          expect(bridge.statistics.usage.loopSuccess).to.equal(0);
          expect(bridge.statistics.usage.loopConflict).to.equal(1);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
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
          expect(bridge.statistics.paging.pageReadSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageReadFailures).to.equal(0);
          expect(bridge.statistics.paging.pageProcessSuccess).to.equal(0);
          expect(bridge.statistics.paging.pageProcessFailures).to.equal(1);
          expect(bridge.statistics.paging.pageProcessEnd).to.equal(0);
        });

        it('populates usage statistics', () => {
          expect(bridge.statistics.usage.reportFailures).to.equal(1);
          expect(bridge.statistics.usage.reportSuccess).to.equal(0);
          expect(bridge.statistics.usage.reportConflict).to.equal(0);
          expect(bridge.statistics.usage.loopFailures).to.equal(1);
          expect(bridge.statistics.usage.loopSuccess).to.equal(0);
          expect(bridge.statistics.usage.loopConflict).to.equal(0);
          expect(bridge.statistics.usage.loopSkip).to.equal(0);
        });

        it('populates carry-over statistics', () => {
          expect(bridge.statistics.carryOver.getSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.getFailure).to.equal(0);
          expect(bridge.statistics.carryOver.removeSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.removeFailure).to.equal(0);
          expect(bridge.statistics.carryOver.upsertSuccess).to.equal(0);
          expect(bridge.statistics.carryOver.upsertFailure).to.equal(0);
        });
      });

      context('when there are several failed requests', () => {
        beforeEach(() => {
          // Mock the request module
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
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %j and response %j', error, response)));
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
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %j and response %j', error, response)));
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
                done(new Error(util.format('Unexpected call of failure with ' +
                  'error %j and response %j', error, response)));
              }, success: () => {
                bridge.stopReporting();
                done();
              }
            });
        });
      });

      context('with missing Location header', () => {
        const resource = appUsagePageTwo.resources[0].entity;
        const expectedErrorMessage = util.format('No Location header found' +
          ' in response %j for usage %j', { statusCode: 201, body: {} },
          generateUsageReport(resource.app_guid,
            resource.memory_in_mb_per_instance * 1024 * 1024,
            resource.instance_count,
            resource.previous_memory_in_mb_per_instance * 1024 * 1024,
            resource.previous_instance_count));

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

        it('throws error', (done) => {
          expect(() => {
            bridge.reportAppUsage(cfToken, abacusToken, {
              success: () => {
                bridge.stopReporting();
                done(new Error('Unexpected call of success'));
              },
              failure: () => {
                bridge.stopReporting();
                done(new Error('Unexpected call of failure'));
              }
            });
          }).to.throw(Error, expectedErrorMessage);
          done();
        });

        it('does not increase the retry count', (done) => {
          expect(() => {
            bridge.reportAppUsage(cfToken, abacusToken, {
              success: () => {
                bridge.stopReporting();
                done(new Error('Unexpected call of success'));
              },
              failure: () => {
                bridge.stopReporting();
                done(new Error('Unexpected call of failure'));
              }
            });
          }).to.throw(Error);
          expect(bridge.reportingConfig.currentRetries).to.equal(0);
          done();
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
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
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
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
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
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          },
          success: () => {
            bridge.stopReporting();

            // Call reporting second time
            bridge.reportAppUsage(cfToken, abacusToken, {
              failure: (error, response) => {
                bridge.stopReporting();
                done(new Error(util.format('Unexpected call of failure with ' +
                  'error %j and response %j', error, response)));
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

  context('when bridge is restarted', () => {
    const bulkDocsMock = spy((docs, opt, cb) => {
      cb(undefined, docs);
    });

    beforeEach(() => {
      // Mock the request module
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

      // Mock the dbclient module
      const dbclient = require('abacus-dbclient');
      const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
      dbclientModule.exports = extend(() => {
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
          bulkDocs: bulkDocsMock
        };
      }, dbclient);
    });

    it('uses the last recorded GUID and timestamp', (done) => {
      // Store GUID in DB
      bridge = require('..');
      bridge.reportingConfig.minInterval = 5;
      bridge.initCache(() => {
        bridge.reportAppUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            bridge.stopReporting();
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', error, response)));
          },
          success: () => {
            deleteModules();
          }
        });
      });

      // Wait for the cache timer to kick in
      setTimeout(() => {
        const args = bulkDocsMock.args;
        expect(args.length).to.equal(1);
        expect(args[0][0][0]).to.deep.equal({
          id: 'abacus-cf-bridge-cache',
          lastRecordedGUID: '904419c6',
          lastRecordedTimestamp: '2015-08-18T11:28:20Z',
          lastCompensatedGUID: undefined,
          lastCompensatedTimestamp: undefined,
          _rev: undefined
        });
        done();
      }, 500);
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
          done(new Error(util.format('Unexpected call of success')));
        },
        failure: (err, resp) => {
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
          expect(bridge.errors.missingToken).to.equal(false);
          done();
        },
        failure: (err, resp) => {
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %j and response %j', err, resp)));
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

        bridge.errors.consecutiveFailures = 5;
      });

      it('noReportEverHappened should be false', (done) => {
        expect(bridge.errors.noReportEverHappened).to.equal(true);
        bridge.reportAppUsage(cfToken, abacusToken, {
          success: () => {
            expect(bridge.errors.noReportEverHappened).to.equal(false);
            expect(bridge.errors.lastError).to.equal('');
            expect(bridge.errors.lastErrorTimestamp).to.equal('');
            done();
          },
          failure: (err, resp) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', err, resp)));
          }
        });
      });

      it('consecutiveFailures should be 0', (done) => {
        expect(bridge.errors.consecutiveFailures).to.equal(5);
        bridge.reportAppUsage(cfToken, abacusToken, {
          success: () => {
            expect(bridge.errors.consecutiveFailures).to.equal(0);
            expect(bridge.errors.lastError).to.equal('');
            expect(bridge.errors.lastErrorTimestamp).to.equal('');
            done();
          },
          failure: (err, resp) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %j and response %j', err, resp)));
          } });
      });
    });

    context('and there are consecutive failures', () => {
      beforeEach(() => {
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
      });

      it('should increment consecutiveFailures', (done) => {
        const currentFailures = bridge.errors.consecutiveFailures;
        const startTime = moment.now();

        bridge.reportAppUsage(cfToken, abacusToken, {
          success: () => {
            done(new Error(util.format('Unexpected call of success')));
          },
          failure: () => {
            expect(bridge.errors.consecutiveFailures)
              .to.equal(currentFailures + 1);
            expect(bridge.errors.lastError).to.equal('Error reporting usage; ' +
              'error: "Failed to post report"; response: {}');
            let errorTime = moment.utc(bridge.errors.lastErrorTimestamp)
              .valueOf();
            expect(errorTime).to.be.at.least(startTime);
            done();
          }
        });
      });
    });
  });
};

describe('Report app usage without security', () => tests(false));

describe('Report app usage with security', () => tests(true));
