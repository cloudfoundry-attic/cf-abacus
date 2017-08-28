'use strict';

const _ = require('underscore');
const extend = _.extend;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

const serviceGuid = 'bc3690b2-cc50-4475-b2cf-44d68c51f9d3';

process.env.SERVICES = `{
  "service": {
    "guid": "${serviceGuid}",
    "plans": ["standard"]
  }
}`;


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
    dbclient.drop(process.env.DB, /^abacus-cf-bridge-/, () => {
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



  const serviceUsageEventsUri = (guid = serviceGuid) => {
    return '/v2/service_usage_events?' +
      'order-direction=asc&results-per-page=50' +
      '&q=service_instance_type:managed_service_instance' +
      `&q=service_guid IN ${guid}`;
  };

  const serviceUsagePageOne = {
    total_results: 4,
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
          service_plan_name: 'standard',
          service_guid: 'mongo-guid',
          service_label: 'service'
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
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          service_instance_guid: '',
          service_instance_name: '',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'standard',
          service_guid: 'mongo-guid',
          service_label: 'service'
        }
      },
      {
        metadata: {
          guid: '3',
          url: '/v2/service_usage_events/3',
          created_at: '2015-08-18T11:28:20Z'
        },
        entity: {
          state: 'CREATED',
          space_guid: 'f057fe03-0713-4896-94c7-24b71c6882c2',
          space_name: 'abacus',
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          service_instance_guid: '',
          service_instance_name: '',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: 'e9d2d5a0-69a6-46ef-bac5-43f3ed177614',
          service_plan_name: 'medium',
          service_guid: 'mongo-guid',
          service_label: 'service'
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
          org_guid: '640257fa-d7aa-4aa4-9a77-08ec60aae4f5',
          service_instance_guid: 'f3a07a06',
          service_instance_name: 'abacus-eureka-plugin',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: 'e9d2d5a0-69a6-46ef-bac5-43f3ed177614',
          service_plan_name: 'standard',
          service_guid: 'redis-guid',
          service_label: 'redis'
        }
      }
    ]
  };
  const serviceUsagePageTwo = {
    total_results: 2,
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
          service_instance_name: 'service',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'standard',
          service_guid: '34916716-31d7-40c1-9afd-f312996c9654',
          service_label: 'service'
        }
      },
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
          org_guid: '42-52-62',
          service_instance_guid: '1234',
          service_instance_name: 'service',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'standard',
          service_guid: '34916716-31d7-40c1-9afd-f312996c9654',
          service_label: 'service'
        }
      },
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
          org_guid: '42-52-62-72',
          service_instance_guid: '5678',
          service_instance_name: 'service',
          service_instance_type: 'managed_service_instance',
          service_plan_guid: '4fd1a379-2738-408e-9020-c5238a47a004',
          service_plan_name: 'standard',
          service_guid: '34916716-31d7-40c1-9afd-f312996c9654',
          service_label: 'service'
        }
      }
    ]
  };

  const checkGetRequest = (expectedAPIOption, expectedURL, req) => {
    expect(req[1]).to.contain.all.keys('api', 'page', 'headers');
    expect(req[1].api).to.equal(expectedAPIOption);
    expect(req[1].page).to.equal(expectedURL);
  };

  const generateUsageReport = (serviceId, orgId, instances) => {
    return {
      start: 1439897300000,
      end: 1439897300000,
      organization_id: orgId,
      space_id: 'f057fe03-0713-4896-94c7-24b71c6882c2',
      consumer_id: 'service:' + serviceId,
      resource_id: 'service',
      plan_id: 'standard',
      resource_instance_id: `service:${serviceId}:standard:service`,
      measured_usage: [
        {
          measure: 'current_instances',
          quantity: instances
        },
        {
          measure: 'previous_instances',
          quantity: 0
        }
      ]
    };
  };

  const checkPostRequest = (req, serviceId, orgId, instances) => {
    expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
    expect(req[1]).to.contain.all.keys('collector', 'body');
    expect(req[1].collector).to.equal('http://collector');
    expect(req[1].body).to.deep.equal(
      generateUsageReport(serviceId, orgId, instances));
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

  context('with empty list of orgs to report', () => {
    beforeEach((done) => {
      mockRequestModule();

      process.env.ORGS_TO_REPORT = '[]';

      reportServiceUsage(done);
    });

    it('gets all service usage events from API', () => {
      const args = reqmock.get.args;
      expect(args.length).to.equal(2);
      checkGetRequest('http://api', serviceUsageEventsUri(), args[0]);
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

    context('not existing org', () => {
      beforeEach((done) => {
        process.env.ORGS_TO_REPORT = '["640257fa-d7aa-4aa4-9a77-08ec60fae4f5"]';

        reportServiceUsage(done);
      });

      it('gets all service usage events from API', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest('http://api', serviceUsageEventsUri(), args[0]);
        checkGetRequest('http://api', '/page2', args[1]);
      });

      it('reports filtered resource usage to COLLECTOR', (done) => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(0);

        done();
      });
    });

    context('one org', () => {
      beforeEach((done) => {
        process.env.ORGS_TO_REPORT = '["640257fa-d7aa-4aa4-9a77-08ec60aae4f5"]';

        reportServiceUsage(done);
      });

      it('gets all service usage events from API', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest('http://api', serviceUsageEventsUri(), args[0]);
        checkGetRequest('http://api', '/page2', args[1]);
      });

      it('reports filtered resource usage to COLLECTOR', (done) => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(2);
        checkPostRequest(args[0],
          'f3a07a06', '640257fa-d7aa-4aa4-9a77-08ec60aae4f5', 1);
        checkPostRequest(args[1],
          '35c4ff2f', '640257fa-d7aa-4aa4-9a77-08ec60aae4f5', 1);

        done();
      });
    });

    context('two orgs', () => {
      beforeEach((done) => {
        process.env.ORGS_TO_REPORT = '["42-52-62", "42-52-62-72"]';

        reportServiceUsage(done);
      });

      it('gets all service usage events from API', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest('http://api', serviceUsageEventsUri(), args[0]);
        checkGetRequest('http://api', '/page2', args[1]);
      });

      it('reports filtered resource usage to COLLECTOR', (done) => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(2);
        checkPostRequest(args[0], '1234', '42-52-62', 1);
        checkPostRequest(args[1], '5678', '42-52-62-72', 1);

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
        reportServiceUsage(done);
      });
    });

    it('uses the guid to get app usage events from API', () => {
      const args = reqmock.get.args;
      expect(args.length).to.equal(2);
      checkGetRequest('http://api', serviceUsageEventsUri() +
        '&after_guid=1', args[0]);
      checkGetRequest('http://api', '/page2', args[1]);
    });

    it('reports resource usage to COLLECTOR', (done) => {
      const args = reqmock.post.args;
      expect(args.length).to.equal(2);
      checkPostRequest(args[0], '1234', '42-52-62', 1);
      checkPostRequest(args[1], '5678', '42-52-62-72', 1);

      done();
    });
  });

});
