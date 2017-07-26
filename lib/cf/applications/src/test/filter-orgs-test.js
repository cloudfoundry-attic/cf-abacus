'use strict';

const _ = require('underscore');
const extend = _.extend;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

describe('Filtering usage', () => {
  let dbEnv;
  let reqmock;
  let bridge;
  let clock;

  const cfToken = () => 'token';
  const abacusToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
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

    cb();
  };

  before(() => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';
  });

  after(() => {
    process.env.DB = dbEnv;

    delete process.env.ORGS_TO_REPORT;
  });

  beforeEach((done) => {
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

    // Delete test dbs on the configured db server
    const dbclient = require('abacus-dbclient');
    dbclient.drop(process.env.DB, /^abacus-cf-applications-/, () => {
      dbclient.drop(process.env.DB, /^abacus-carry-over-/, done);
    });
  });

  afterEach(() => {
    if (bridge)
      bridge.stopReporting();
    if (clock)
      clock.restore();

    deleteModules();
  });

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
    total_results: 2,
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
      },
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
          app_guid: '1234',
          app_name: 'app',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '42-52-62',
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
          app_guid: '5678',
          app_name: 'app',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '42-52-62-72',
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

  const checkGetRequest = (expectedAPIOption, expectedURL, req) => {
    expect(req[1]).to.contain.all.keys('api', 'page', 'headers');
    expect(req[1].api).to.equal(expectedAPIOption);
    expect(req[1].page).to.equal(expectedURL);
  };

  const generateUsageReport = (appId, orgId, currentInstanceMemory,
                               currentInstances, previousInstanceMemory,
                               previousInstances) => {
    return {
      start: 1439897300000,
      end: 1439897300000,
      organization_id: orgId,
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

  const checkPostRequest = (req, appId, orgId,
                            currentMemory, currentInstances,
                            previousMemory, previousInstances) => {
    expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
    expect(req[1]).to.contain.all.keys('collector', 'body');
    expect(req[1].collector).to.equal('http://collector');
    expect(req[1].body).to.deep.equal(
      generateUsageReport(appId, orgId,
        currentMemory, currentInstances,
        previousMemory, previousInstances));
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

  context('with empty list of orgs to report', () => {
    beforeEach((done) => {
      mockRequestModule();

      process.env.ORGS_TO_REPORT = '[]';

      reportAppUsage(done);
    });

    it('gets all app usage events from API', () => {
      const args = reqmock.get.args;
      expect(args.length).to.equal(2);
      checkGetRequest('http://api', '/v2/app_usage_events?' +
        'order-direction=asc&results-per-page=50', args[0]);
      checkGetRequest('http://api', '/page2', args[1]);
    });

    it('reports no usage to COLLECTOR', (done) => {
      const args = reqmock.post.args;
      expect(args.length).to.equal(0);
      done();
    });
  });

  context('with list of orgs', () => {
    beforeEach(() => {
      mockRequestModule();
    });

    context('one org', () => {
      beforeEach((done) => {
        process.env.ORGS_TO_REPORT = '["640257fa-d7aa-4aa4-9a77-08ec60aae4f5"]';

        reportAppUsage(done);
      });

      it('gets all app usage events from API', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest('http://api', '/v2/app_usage_events?' +
          'order-direction=asc&results-per-page=50', args[0]);
        checkGetRequest('http://api', '/page2', args[1]);
      });

      it('reports filtered resource usage to COLLECTOR', (done) => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(2);
        checkPostRequest(args[0],
          'f3a07a06', '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          1073741824, 2, 0, 0);
        checkPostRequest(args[1],
          '35c4ff2f', '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          536870912, 1, 268435456, 2);

        done();
      });
    });

    context('two orgs', () => {
      beforeEach((done) => {
        process.env.ORGS_TO_REPORT = '["42-52-62", "42-52-62-72"]';

        reportAppUsage(done);
      });

      it('gets all app usage events from API', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest('http://api', '/v2/app_usage_events?' +
          'order-direction=asc&results-per-page=50', args[0]);
        checkGetRequest('http://api', '/page2', args[1]);
      });

      it('reports filtered resource usage to COLLECTOR', (done) => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(2);
        checkPostRequest(args[0],
          '1234', '42-52-62', 536870912, 1, 268435456, 2);
        checkPostRequest(args[1],
          '5678', '42-52-62-72', 536870912, 1, 268435456, 2);

        done();
      });
    });
  });

  context('with last recorded guid', () => {
    beforeEach((done) => {
      mockRequestModule();

      process.env.LAST_RECORDED_GUID = '1';

      bridge.initCache((error) => {
        expect(error).to.equal(undefined);
        reportAppUsage(done);
      });
    });

    it('uses the guid to get app usage events from API', () => {
      const args = reqmock.get.args;
      expect(args.length).to.equal(2);
      checkGetRequest('http://api', '/v2/app_usage_events?' +
        'order-direction=asc&results-per-page=50&after_guid=1', args[0]);
      checkGetRequest('http://api', '/page2', args[1]);
    });

    it('reports resource usage to COLLECTOR', (done) => {
      const args = reqmock.post.args;
      expect(args.length).to.equal(2);
      checkPostRequest(args[0],
        '1234', '42-52-62', 536870912, 1, 268435456, 2);
      checkPostRequest(args[1],
        '5678', '42-52-62-72', 536870912, 1, 268435456, 2);

      done();
    });
  });

});
