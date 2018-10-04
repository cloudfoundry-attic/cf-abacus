'use strict';

/* eslint-disable no-unused-expressions */

const _ = require('underscore');
const findWhere = _.findWhere;

const util = require('util');

const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const request = require('abacus-request');
const { yieldable, functioncb } = require('abacus-yieldable');

const testUtils = require('abacus-test-utils');
const createTestAppClient = require('./test-app-client');

const testEnv = {
  api: process.env.CF_API,
  user: process.env.CF_ADMIN_USER,
  password: process.env.CF_ADMIN_PASSWORD,
  org: process.env.BROKER_TEST_ORG,
  space: process.env.CF_SPACE,
  collectorUrl: process.env.COLLECTOR_URL,
  reportingUrl: process.env.REPORTING_URL,
  provisioningUrl: process.env.PROVISIONING_URL,
  serviceName: process.env.SERVICE_NAME,
  servicePlan: process.env.SERVICE_PLAN
};

const { App, Service } = testUtils.cf({
  api: testEnv.api,
  user: testEnv.user,
  password: testEnv.password
});

const abacusClient = testUtils.abacusClient(
  testEnv.provisioningUrl,
  testEnv.collectorUrl,
  testEnv.reportingUrl
);

const totalTimeout = process.env.TOTAL_TIMEOUT || 300000;

const testPlan = {
  measures: [
    {
      name: 'storage',
      unit: 'BYTE'
    }],
  metrics: [
    {
      name: 'storage',
      unit: 'GIGABYTE',
      type: 'discrete',
      meter: ((m) => new BigNumber(m.storage)
        .div(1073741824).toNumber()).toString(),
      accumulate: ((a, qty, start, end, from, to, twCell) =>
        end < from || end >= to ? null : Math.max(a, qty))
        .toString()
    }]
};

const complexMeteringPlan = {
  plans: [
    {
      plan: {
        plan_id: 'standard-object-storage',
        measures: [
          {
            name: 'storage',
            unit: 'BYTE'
          },
          {
            name: 'light_api_calls',
            unit: 'CALL'
          },
          {
            name: 'heavy_api_calls',
            unit: 'CALL'
          }],
        metrics: [
          {
            name: 'storage',
            unit: 'GIGABYTE',
            type: 'discrete',
            meter: ((m) => new BigNumber(m.storage)
              .div(1073741824).toNumber()).toString(),
            accumulate: ((a, qty, start, end, from, to, twCell) =>
              end < from || end >= to ? null :
                Math.max(a, qty)).toString()
          },
          {
            name: 'thousand_light_api_calls',
            unit: 'THOUSAND_CALLS',
            type: 'discrete',
            meter: ((m) => new BigNumber(m.light_api_calls)
              .div(1000).toNumber()).toString(),
            aggregate: ((a, prev, curr, aggTwCell, accTwCell) =>
              new BigNumber(a || 0).add(curr).sub(prev).toNumber())
              .toString()
          },
          {
            name: 'heavy_api_calls',
            unit: 'CALL',
            type: 'discrete',
            meter: ((m) => m.heavy_api_calls).toString()
          }]
      }
    }
  ]
};

describe('Abacus Broker Acceptance test', function() {
  this.timeout(totalTimeout);

  let app;
  let orgId;
  let spaceId;
  let testAppClient;

  before(() => {
    app = App.deploy({
      target:{
        orgName: testEnv.org,
        spaceName: testEnv.space
      },
      app: {
        name: `${moment.utc().valueOf()}-test-app`,
        manifest: `${__dirname}/apps/test-app/manifest.yml`
      }
    });

    orgId = app.orgGuid;
    spaceId = app.spaceGuid;
    testAppClient = createTestAppClient(app.getUrl());
  });

  after(() => {
    if (app) app.destroy();
  });

  context('when "Resource provider" is not provided', () => {

    const validateInstance = function*(instance, measuredUsage) {
      instance.bind(app.guid);
      app.restart();

      const credentials = yield yieldable(testAppClient.getCredentials);

      expect(credentials).to.have.property('client_id');
      expect(credentials).to.have.property('client_secret');
      expect(credentials).to.have.property('resource_id');
      expect(credentials).to.have.property('plans');

      const resourceId = credentials.resource_id;
      const clientId = credentials.client_id;
      const clientSecret = credentials.client_secret;

      const usageToken = oauth.cache(testEnv.api, clientId, clientSecret,
        `abacus.usage.${resourceId}.write,abacus.usage.${resourceId}.read`);

      yield yieldable(usageToken.start);

      const now = moment.utc().valueOf();
      const resourceInstanceId = `${now}-151-413-121-110987654321d`;
      const consumerId = `app:${resourceInstanceId}`;
      const usageBody = {
        start: now,
        end: now,
        organization_id: orgId,
        space_id: spaceId,
        resource_id: resourceId,
        plan_id: 'standard',
        consumer_id: consumerId,
        resource_instance_id: resourceInstanceId,
        measured_usage: measuredUsage
      };

      const postResponse = yield yieldable(testAppClient.postUsage)(usageBody);
      expect(postResponse.statusCode).to.be.oneOf([202, 409]);

      const locationHeader = postResponse.headers.location;
      expect(locationHeader).to.not.equal(undefined);
      yield yieldable(abacusClient.waitUntilUsageIsProcessed)(usageToken, locationHeader, totalTimeout);

      const getResponse = yield yieldable(abacusClient.getOrganizationUsage)(usageToken, orgId);
      expect(getResponse.statusCode).to.equal(200);
      expect(getResponse.body.resources.length).to.equal(1);

      const expectedSpace = findWhere(getResponse.body.spaces, { space_id: spaceId });
      expect(expectedSpace.resources.length).to.equal(1);

      const expectedConsumer = findWhere(expectedSpace.consumers, { consumer_id: consumerId });
      expect(expectedConsumer.resources.length).to.equal(1);

      const expectedResources = findWhere(getResponse.body.resources, { resource_id: resourceId });
      expect(expectedResources.resource_id).to.equal(resourceId);
    };

    const noResourceProviderParameters = {
      plans: [{ plan: testPlan }]
    };

    context('when service is created', () => {
      let serviceInstance;

      before(() => {
        serviceInstance = Service.createInstance({
          spaceGuid: spaceId,
          instanceName: `create-test-${moment.utc().valueOf()}`,
          service: {
            name: testEnv.serviceName,
            plan: testEnv.servicePlan
          },
          parameters: noResourceProviderParameters
        });
      });

      after(() => {
        serviceInstance.destroy();
      });

      it('instance should successfully process usage', functioncb(function*() {
        yield validateInstance(serviceInstance,
          [{
            measure: 'storage',
            quantity: 1073741824
          }]);
      }));
    });

    context('when service is updated', () => {
      let serviceInstance;
      let updateResult;

      before(() => {
        serviceInstance = Service.createInstance({
          spaceGuid: spaceId,
          instanceName: `update-test-${moment.utc().valueOf()}`,
          service: {
            name: testEnv.serviceName,
            plan: testEnv.servicePlan
          },
          parameters: noResourceProviderParameters
        });
        updateResult = serviceInstance.update(complexMeteringPlan);
      });

      after(() => serviceInstance.destroy());

      it('should return update success', () => {
        expect(updateResult.entity.last_operation.state).to.equal('succeeded');
      });

      it('instance should successfully process usage', functioncb(function*() {
        yield validateInstance(serviceInstance,
          [{
            measure: 'storage',
            quantity: 1073741824
          }, {
            measure: 'light_api_calls',
            quantity: 1000
          }, {
            measure: 'heavy_api_calls',
            quantity: 100
          }]);
      }));
    });
  });

  context('when "Resource provider" is provided', () => {
    const testServiceName = 'test-service';
    const testServicePlanName = 'test-service-plan-name';
    const mappingAppName = 'service-mapping-test-app';

    let serviceInstance;
    let mappingApp;

    before(() => {
      mappingApp = App.deploy({
        target: {
          orgName: testEnv.org,
          spaceName: testEnv.space
        },
        app: {
          name: mappingAppName,
          manifest: `${__dirname}/apps/test-mapping-app/manifest.yml`
        }
      });
      mappingApp.start();

      const parameters = {
        plans: [
          {
            plan: testPlan,
            resource_provider: {
              service_name: testServiceName,
              service_plan_name: testServicePlanName
            }
          }
        ]
      };
      serviceInstance = Service.createInstance({
        spaceGuid: spaceId,
        instanceName: `with-resource-provider-${moment.utc().valueOf()}`,
        service: {
          name: testEnv.serviceName,
          plan: testEnv.servicePlan
        },
        parameters
      });
    });

    after(() => {
      serviceInstance.destroy();
      mappingApp.destroy();
    });

    const getServiceMappings = function*() {
      const yGet = yieldable(request.get);
      return yield yGet(`${mappingApp.getUrl()}/v1/provisioning/mappings/services`);
    };

    it('Mapping API has received resource provider data', functioncb(function*() {
      const getResponse = yield getServiceMappings();
      expect(getResponse.statusCode).to.equal(200);

      const data = getResponse.body;
      expect(data.length, util.format('Expected 1 element, but found %j', data)).to.equal(1);

      const mappingValue = data[0][1];

      expect(mappingValue).to.deep.equal({
        'organization_guid': orgId,
        'space_guid': spaceId,
        'service_name': testServiceName,
        'service_plan_name': testServicePlanName
      });
    }));

    context('on update', () => {
      before(() => {
        const changedResourceProvider = {
          plans: [
            {
              plan: testPlan,
              resource_provider: {
                service_name: 'name',
                service_plan_name: 'plan'
              }
            }
          ]
        };
        serviceInstance.update(changedResourceProvider);
      });

      it('Mapping API has updated the resource provider data', functioncb(function*() {
        const getResponse = yield getServiceMappings();
        expect(getResponse.statusCode).to.equal(200);

        const data = getResponse.body;
        expect(data.length, util.format('Expected 1 element, but found %j', data)).to.equal(1);

        const mappingValue = data[0][1];

        expect(mappingValue).to.deep.equal({
          organization_guid: orgId,
          space_guid: spaceId,
          service_name: 'name',
          service_plan_name: 'plan'
        });
      }));
    });
  });
});
