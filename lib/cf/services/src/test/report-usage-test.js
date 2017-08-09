'use strict';

const moment = require('abacus-moment');

const _ = require('underscore');
const extend = _.extend;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';
process.env.SERVICES = `{
  "mongodb": {
    "guid": "bc3690b2-cc50-4475-b2cf-44d68c51f9d3",
    "plans": ["v3.0-dedicated-small"]
  }
}`;

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
    dbclient.drop(process.env.DB, /^abacus-cf-services-/, () => {
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

  const generateUsageReport = (serviceId,
     currentInstances, previousInstances) => ({
       start: eventTimeStamp,
       end: eventTimeStamp,
       organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
       space_id: 'f057fe03-0713-4896-94c7-24b71c6882c2',
       consumer_id: 'service:' + serviceId,
       resource_id: 'service',
       plan_id: 'standard',
       resource_instance_id: 
        'service:mongodb:v3.0-dedicated-small:' + serviceId,
       measured_usage: [
         {
           measure: 'current_instances',
           quantity: currentInstances
         },
         {
           measure: 'previous_instances',
           quantity: previousInstances
         }
       ]
     });

  const checkUsageReport = (done, serviceId, currentInstances,
    previousInstances) => {
    const args = reqmock.post.args;
    expect(args.length).to.equal(1);
    expect(args[0][0]).to.equal(':collector/v1/metering/collected/usage');
    expect(args[0][1]).to.contain.all.keys('collector', 'body');
    expect(args[0][1].collector).to.equal('http://collector');
    expect(args[0][1].body).to.deep.equal(
      generateUsageReport(serviceId, currentInstances, previousInstances));
    done();
  };

  const expectError = (srvBridge, expectedError, expectedResponse, done) => {
    return {
      failure: (error, response) => {
        if (srvBridge)
          srvBridge.stopReporting();
        if (error instanceof Error)
          expect(error.message).to.equal(expectedError);
        else
          expect(error).to.equal(expectedError);
        expect(response).to.deep.equal(expectedResponse);
        done();
      },
      success: () => {
        srvBridge.stopReporting();
        done(new Error('Unexpected call of success'));
      }
    };
  };

  const serviceUsagePageOne = {
    total_results: 2,
    total_pages: 2,
    prev_url: null,
    next_url: '/page2',
    resources: [
      {
        metadata: {
          guid: '1',
          url: '/v2/service_usage_events/1',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'CREATED',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          service_instance_guid: 'f3a07a06',
          service_instance_name: 'abacus-eureka-plugin',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'v3.0-dedicated-small',
          service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
          service_label: 'mongodb'
        }
      },
      {
        metadata: {
          guid: '2',
          url: '/v2/service_usage_events/2',
          created_at: '2015-08-18T11:28:21Z'
        },
        entity: {
          state: 'UPDATED',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          service_instance_guid: '',
          service_instance_name: '',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'v3.0-dedicated-small',
          service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
          service_label: 'mongodb'
        }
      }
    ]
  };
  const serviceUsagePageTwo = {
    total_results: 1,
    total_pages: 1,
    prev_url: null,
    next_url: null,
    resources: [
      {
        metadata: {
          guid: '904419c6',
          url: '/v2/service_usage_events/904419c4',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'CREATED',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          service_instance_guid: '35c4ff2f',
          service_instance_name: 'app',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'v3.0-dedicated-small',
          service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
          service_label: 'mongodb'
        }
      }
    ]
  };
  const serviceUsagePageWithEqualCreatedAt = {
    total_results: 4,
    total_pages: 1,
    prev_url: null,
    next_url: null,
    resources: [
      {
        metadata: {
          guid: '1',
          url: '/v2/service_usage_events/1',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'CREATED',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6',
          service_instance_guid: 'f3a07a06',
          service_instance_name: 'abacus-eureka-plugin',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'v3.0-dedicated-small',
          service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
          service_label: 'mongodb'
        }
      },
      {
        metadata: {
          guid: '2',
          url: '/v2/service_usage_events/2',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'UPDATED',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6',
          service_instance_guid: '',
          service_instance_name: '',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'v3.0-dedicated-small',
          service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
          service_label: 'mongodb'
        }
      },
      {
        metadata: {
          guid: '3',
          url: '/v2/service_usage_events/3',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'DELETED',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6',
          service_instance_guid: 'f3a07a06',
          service_instance_name: 'abacus-eureka-plugin',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'v3.0-dedicated-small',
          service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
          service_label: 'mongodb'
        }
      },
      {
        metadata: {
          guid: '4',
          url: '/v2/service_usage_events/4',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'CREATED',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6',
          service_instance_guid: 'f3a07a06',
          service_instance_name: 'abacus-eureka-plugin',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'v3.0-dedicated-small',
          service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
          service_label: 'mongodb'
        }
      }
    ]
  };

  const mockRequestModule = () => {
    const request = require('abacus-request');
    reqmock = extend({}, request, {
      get: spy((uri, opts, cb) => {
        if (opts.page.indexOf('page2') > -1)
          cb(null, { statusCode: 200, body: serviceUsagePageTwo });
        else
          cb(null, { statusCode: 200, body: serviceUsagePageOne });
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

  const reportServiceUsage = (done) => {
    bridge = require('..');
    bridge.reportingConfig.minInterval = 5000;
    bridge.reportServiceUsage(cfToken, abacusToken, {
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

        reportServiceUsage(done);
      });

      const checkGetRequest = (expectedAPIOption, expectedURL, req) => {
        expect(req[1]).to.contain.all.keys('api', 'page', 'headers');
        expect(req[1].api).to.equal(expectedAPIOption);
        expect(req[1].page).to.equal(expectedURL);
      };

      it('gets service usage events from API', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest('http://api', '/v2/service_usage_events?' +
          'order-direction=asc&results-per-page=50' +
          '&q=service_guid IN bc3690b2-cc50-4475-b2cf-44d68c51f9d3', args[0]);
        checkGetRequest('http://api', '/page2', args[1]);
      });

      const checkPostRequest = (req, serviceId,
                                currentInstances, previousInstances) => {
        expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
        expect(req[1]).to.contain.all.keys('collector', 'body');
        expect(req[1].collector).to.equal('http://collector');
        expect(req[1].body).to.deep.equal(
          generateUsageReport(serviceId, currentInstances, previousInstances));
      };

      it('reports resource usage to COLLECTOR', () => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(2);
        checkPostRequest(args[0], 'f3a07a06', 1, 0);
        checkPostRequest(args[1], '35c4ff2f', 1, 0);
      });

      it('populates paging statistics', () => {
        checkPagingStats(bridge.statistics.paging, {
          pageReadSuccess: 1,
          pageProcessSuccess: 3,
          pageProcessEnd: 2
        });
      });

      it('populates usage statistics', () => {
        checkUsageStats(bridge.statistics.usage, {
          reportSuccess: 2,
          loopSuccess: 2,
          loopSkip: 1
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
      context('for created service', () => {
        beforeEach((done) => {
          // Deep-clone page two
          const serviceUsagePage = JSON.parse(JSON.stringify(
            serviceUsagePageTwo));
          const resourceEntity = serviceUsagePage.resources[0].entity;
          resourceEntity.previous_state = 'STOPPED';
          resourceEntity.previous_instance_count = 0;
          resourceEntity.previous_memory_in_mb_per_instance = 0;

          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: serviceUsagePage });
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

          reportServiceUsage(done);
        });

        it('reports service usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 1, 0);
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

      context('for scaling service', () => {
        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: serviceUsagePageTwo });
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

          reportServiceUsage(done);
        });

        it('reports service usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 1, 0);
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

      context('for deleting service', () => {
        beforeEach((done) => {
          // Deep-clone page two
          const serviceUsagePage = JSON.parse(JSON.stringify(
            serviceUsagePageTwo));
          const resourceEntity = serviceUsagePage.resources[0].entity;
          resourceEntity.state = 'DELETED';

          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: serviceUsagePage });
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

          reportServiceUsage(done);
        });

        it('reports service usage event', (done) => {
          checkUsageReport(done, '35c4ff2f', 0, 1);
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
    const serviceUsage = {
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
            cb(null, { statusCode: 200, body: serviceUsage });
          else
            if (opts.page.indexOf('page2') > -1)
              cb(null, { statusCode: 200, body: serviceUsagePageTwo });
            else
              cb(null, { statusCode: 200, body: serviceUsagePageOne });
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

    it('does not report service usage', (done) => {
      bridge.reportServiceUsage(cfToken, abacusToken, {
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

    it('continues reporting on new service usage', (done) => {
      bridge.reportServiceUsage(cfToken, abacusToken, {
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
          bridge.reportServiceUsage(cfToken, abacusToken,
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
          bridge.reportServiceUsage(cfToken, abacusToken,
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
          bridge.reportServiceUsage(() => undefined, abacusToken,
            expectError(bridge, 'Missing CF token', undefined, done));
        });

        it('populates paging statistics', () => {
          checkPagingStats(bridge.statistics.paging, {
            missingToken: 1
          });
        });

        it('does not change usage statistics', () => {
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
              cb(null, { statusCode: 200, body: serviceUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb(null, { statusCode: 500, body: {} });
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportServiceUsage(cfToken, abacusToken,
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

        it('does not change carry-over statistics', () => {
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
                cb(null, { statusCode: 200, body: serviceUsagePageTwo });
              }),
              post: spy((uri, opts, cb) => {
                cb(null, { statusCode: 409, body: {
                  error: 'conflict',
                  reason: 'Conflict? Please retry'
                } });
              })
            });
            require.cache[require.resolve('abacus-request')].exports = reqmock;

            reportServiceUsage(done);
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

          it('does not change carry-over statistics', () => {
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
                cb(null, { statusCode: 200, body: serviceUsagePageTwo });
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

            reportServiceUsage(done);
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
                cb(null, { statusCode: 200, body: serviceUsagePageTwo });
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
            bridge.reportServiceUsage(cfToken, abacusToken, {
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
                cb(null, { statusCode: 200, body: serviceUsagePageTwo });
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
            bridge.reportServiceUsage(cfToken, abacusToken, {
              failure: (error, response) => {
                bridge.stopReporting();

                expect(error).to.deep.equal(errorBody);
                expect(response.statusCode).to.equal(500);

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
      });

      context('on error', () => {
        beforeEach((done) => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: serviceUsagePageTwo });
            }),
            post: spy((uri, opts, cb) => {
              cb('error', {});
            })
          });
          require.cache[require.resolve('abacus-request')].exports = reqmock;

          bridge = require('..');
          bridge.reportingConfig.minInterval = 5000;
          bridge.reportServiceUsage(cfToken, abacusToken,
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
          bridge.reportServiceUsage(cfToken, abacusToken, {
            success: () => {
              bridge.stopReporting();

              expect(bridge.reportingConfig.currentRetries).to.equal(0);
              done();
            },
            failure: (error, response) => {
              bridge.stopReporting();
              done(new Error('Unexpected call of failure with ' +
                `error ${error} and response ${response}`));
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
                cb(null, { statusCode: 200, body: serviceUsagePageTwo });
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
          bridge.reportServiceUsage(cfToken, abacusToken, {
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
          bridge.reportServiceUsage(cfToken, abacusToken, {
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
              cb(null, { statusCode: 200, body: serviceUsagePageTwo });
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
            bridge.reportServiceUsage(cfToken, () => undefined,
              expectError(bridge, 'Missing resource provider token',
                null, done));
          else
            bridge.reportServiceUsage(cfToken, () => undefined, {
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
        const resource = serviceUsagePageTwo.resources[0].entity;
        const expectedErrorMessage = 'No Location header found' +
          ' in response { statusCode: 201, body: {} } for usage ' +
          generateUsageReport(resource.service_instance_guid, 1, 0);

        beforeEach(() => {
          // Mock the request module
          const request = require('abacus-request');
          reqmock = extend({}, request, {
            get: spy((uri, opts, cb) => {
              cb(null, { statusCode: 200, body: serviceUsagePageTwo });
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
          bridge.reportServiceUsage(cfToken, abacusToken, {
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
          bridge.reportServiceUsage(cfToken, abacusToken, {
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
              cb(null, { statusCode: 200, body: serviceUsagePageTwo });
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
          bridge.reportServiceUsage(cfToken, abacusToken, {
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

          bridge.reportServiceUsage(cfToken, abacusToken, {
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
    const serviceUsage = {
      total_results: 1,
      total_pages: 1,
      prev_url: null,
      next_url: null,
      resources: [
        {
          metadata: {
            guid: '904419c6ddba',
            url: '/v2/service_usage_events/904419c4',
            created_at: '0'
          },
          entity: {
            state: 'CREATED',
            space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
            space_name: 'abacus',
            org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
            service_instance_guid: '35c4ff0f',
            service_instance_name: 'app',
            service_instance_type: 'managed_service_instance',
            service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
            service_plan_name: 'v3.0-dedicated-small',
            service_guid: 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3',
            service_label: 'mongodb'
          }
        }
      ]
    };

    context('when we just recorded guid', () => {
      const date = moment.utc(moment.now() - 5000).toISOString();

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            serviceUsage.resources[0].metadata.created_at = date;
            cb(null, { statusCode: 200, body: serviceUsage });
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
        bridge.reportServiceUsage(cfToken, abacusToken, {
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
            serviceUsage.resources[0].metadata.created_at = date;
            cb(null, { statusCode: 200, body: serviceUsage });
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
        bridge.reportServiceUsage(cfToken, abacusToken, {
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
            serviceUsage.resources[0].metadata.created_at =
              moment.utc(moment.now() - 600000).toISOString();
            cb(null, { statusCode: 200, body: serviceUsage });
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
        bridge.reportServiceUsage(cfToken, abacusToken, {
          failure: (error, response) => {
            bridge.stopReporting();
            done(new Error('Unexpected call of failure with ' +
              `error ${error} and response ${response}`));
          },
          success: () => {
            bridge.stopReporting();

            // Call reporting second time
            bridge.reportServiceUsage(cfToken, abacusToken, {
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
        bridge.reportServiceUsage(cfToken, abacusToken, {
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
      bridge.reportServiceUsage(null, () => null, {
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
      bridge.reportServiceUsage(cfToken, abacusToken, {
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
              body: serviceUsagePageTwo
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;
        bridge = require('..');
        bridge.errors.consecutiveReportFailures = 5;
      });

      it('noReportEverHappened should be false', (done) => {
        expect(bridge.errors.noReportEverHappened).to.equal(true);
        bridge.reportServiceUsage(cfToken, abacusToken, {
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
        bridge.reportServiceUsage(cfToken, abacusToken, {
          success: () => {
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

        bridge.reportServiceUsage(cfToken, abacusToken, {
          success: () => {
            bridge.stopReporting();
            cb(new Error('Unexpected call of success'));
          },
          failure: () => {
            bridge.stopReporting();
            expect(bridge.errors.consecutiveReportFailures).
              to.equal(expectedFailures);
            expect(bridge.errors.lastError).to.equal('Error reporting usage; '
              + 'error: Failed to post report; response: {}');
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
              body: serviceUsagePageTwo
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
        body: serviceUsagePageWithEqualCreatedAt
      });
      sandbox.stub(request, 'post').yields(undefined, {
        statusCode: 201,
        headers: { location: 'some location' },
        body: {}
      });

      cleanDB(() => {
        bridge = require('..');
        bridge.reportingConfig.minInterval = 5000;
        bridge.reportServiceUsage(cfToken, abacusToken, {
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
      expect(request.post.callCount).to.equal(3);
      expect(request.post.getCall(0).args[1].body).include({
        start: 1439897300000,
        end:   1439897300000,
        organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6'
      });
      expect(request.post.getCall(1).args[1].body).include({
        start: 1439897300001,
        end:   1439897300001,
        organization_id: '640257fa-d7aa-4aa4-9a77-08ec60aae4f6'
      });
      expect(request.post.getCall(2).args[1].body).include({
        start: 1439897300002,
        end:   1439897300002,
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
        reportSuccess: 3,
        loopSuccess: 3,
        loopSkip: 1 // UPDATE event
      });
    });

    it('change carry-over statistics', () => {
      checkCarryOverStats(bridge.statistics.carryOver, {
        getSuccess: 4,
        getNotFound: 2,
        upsertSuccess: 3
      });
    });
  });
};

describe('Report service usage without security', () => tests(false));

describe('Report service usage with security', () => tests(true));

