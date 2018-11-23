'use strict';

const { extend } = require('underscore');
const httpStatus = require('http-status-codes');
const util = require('util');
const { BasicAuthHeaderProvider } = require('abacus-api');
const createLifecycleManager = require('abacus-lifecycle-manager');
const { ServiceBrokerClient } = require('./service-broker-client');

const {
  externalSystems,
  cfServerMock,
  uaaServerMock,
  provisioningServerMock,
  serviceMappingServerMock
} = require('abacus-mock-util');
const { createTokenFactory } = require('abacus-test-helper');

const createExternalSystems = externalSystems({
  uaaServer: uaaServerMock,
  cfServer: cfServerMock,
  provisioningServer: provisioningServerMock,
  serviceMappingServer: serviceMappingServerMock
});

describe('Broker tests', () => {
  const serviceName = 'service-name';
  const servicePlanName = 'service-plan-name';
  const instanceId = '12345';
  const dashboardUri = 'http://dashboard.uri';
  const brokerUser = 'broker-user';
  const brokerPassword = 'broker-password';
  const brokerPort = '10001';
  const brokerUrl = `http://localhost:${brokerPort}`;
  const scopes = ['abacus.usage.read', 'abacus.usage.write'];
  const clientId = 'client-id';
  const clientSecret = 'client-secret';
  const jwtSecret = 'jwt-secret';
  const serviceInstanceRequest = {
    context: {
      organization_guid: 'organization-guid',
      space_guid: 'space-guid'
    },
    parameters: {
      plans: [{
        resource_provider: {
          service_name: serviceName,
          service_plan_name: servicePlanName
        },
        plan: {
          plan_id: 'id'
        }
      }]
    }
  };

  let lifecycleManager;
  let externalSystemsMocks;
  let resultDashboardUrl;
  let token;
  let serviceBrokerClient;

  before(async () => {
    externalSystemsMocks = createExternalSystems();
    await util.promisify(externalSystemsMocks.startAll)();

    const tokenFactory = createTokenFactory(jwtSecret);
    token = tokenFactory.create(scopes);
    externalSystemsMocks
      .uaaServer
      .tokenService
      .whenScopesAre(scopes)
      .return(token);

    externalSystemsMocks
      .cfServer
      .infoService
      .returnUaaAddress(externalSystemsMocks.uaaServer.url());

    lifecycleManager = createLifecycleManager();

    const env = extend({}, process.env, {
      MAPPING_API: externalSystemsMocks.serviceMappingServer.url(),
      API: externalSystemsMocks.cfServer.url(),
      AUTH_SERVER: externalSystemsMocks.cfServer.url(),
      PROVISIONING: externalSystemsMocks.provisioningServer.url(),
      DASHBOARD_URI: dashboardUri,
      JWTKEY: jwtSecret,
      JWTALGO: 'HS256',
      SERVICE_BROKER_CLIENT_ID: clientId,
      SERVICE_BROKER_CLIENT_SECRET: clientSecret,
      BROKER_USER: brokerUser,
      BROKER_PASSWORD: brokerPassword,
      PORT: brokerPort
    });

    lifecycleManager.useEnv(env).startModules([
      lifecycleManager.modules.broker
    ]);

    serviceBrokerClient = new ServiceBrokerClient(brokerUrl, new BasicAuthHeaderProvider({
      username: brokerUser,
      password: brokerPassword
    }));
  });

  after(async () => {
    lifecycleManager.stopAllStarted();
    await util.promisify(externalSystemsMocks.stopAll)();
  });

  const itTokenPropagated = (name, serviceMock) =>
    it(name, async () => {
      const requests = serviceMock().requests();
      expect(requests.length).to.equal(1);
      expect(requests[0].token).to.equal(token);
    });

  describe('Create service instance', () => {

    context('when create service is called', () => {

      before(async() => {
        externalSystemsMocks.serviceMappingServer.createServiceMappingService.return.always(httpStatus.OK);

        externalSystemsMocks.provisioningServer.createMeteringPlanService.return.always(httpStatus.CREATED);
        externalSystemsMocks.provisioningServer.createRatingPlanService.return.always(httpStatus.CREATED);
        externalSystemsMocks.provisioningServer.createPricingPlanService.return.always(httpStatus.CREATED);

        externalSystemsMocks.provisioningServer.createMeteringMappingService.return.always(httpStatus.OK);
        externalSystemsMocks.provisioningServer.createRatingMappingService.return.always(httpStatus.OK);
        externalSystemsMocks.provisioningServer.createPricingMappingService.return.always(httpStatus.OK);

        resultDashboardUrl = await eventually(
          async () => await serviceBrokerClient.createServiceInstance(instanceId, serviceInstanceRequest)
        );
      });

      it('should return dashboard url', async () => {
        expect(resultDashboardUrl).to.equal(`${dashboardUri}/${instanceId}`);
      });

      itTokenPropagated('should propagate oauth token to createServiceMapping service',
        () => externalSystemsMocks.serviceMappingServer.createServiceMappingService);

      itTokenPropagated('should propagate oauth token to createMeteringPlan service',
        () => externalSystemsMocks.provisioningServer.createMeteringPlanService);

      itTokenPropagated('should propagate oauth token to createPricingPlan service',
        () => externalSystemsMocks.provisioningServer.createPricingPlanService);

      itTokenPropagated('should propagate oauth token to createRatingPlan service',
        () => externalSystemsMocks.provisioningServer.createRatingPlanService);

      itTokenPropagated('should propagate oauth token to createMeteringMapping service',
        () => externalSystemsMocks.provisioningServer.createMeteringMappingService);

      itTokenPropagated('should propagate oauth token to createPricingMapping service',
        () => externalSystemsMocks.provisioningServer.createPricingMappingService);

      itTokenPropagated('should propagate oauth token to createRatingMapping service',
        () => externalSystemsMocks.provisioningServer.createRatingMappingService);
    });
  });

  describe('Update service instance', () => {

    context('when update service is called', () => {

      before(async() => {
        externalSystemsMocks.serviceMappingServer.updateServiceMappingService.return.always(httpStatus.OK);

        externalSystemsMocks.provisioningServer.updateMeteringPlanService.return.always(httpStatus.OK);
        externalSystemsMocks.provisioningServer.updateRatingPlanService.return.always(httpStatus.OK);
        externalSystemsMocks.provisioningServer.updatePricingPlanService.return.always(httpStatus.OK);

        await eventually(
          async () => await serviceBrokerClient.updateServiceInstance(instanceId, serviceInstanceRequest)
        );
      });

      itTokenPropagated('should propagate oauth token to updateServiceMapping service',
        () => externalSystemsMocks.serviceMappingServer.updateServiceMappingService);

      itTokenPropagated('should propagate oauth token to updateMeteringPlan service',
        () => externalSystemsMocks.provisioningServer.updateMeteringPlanService);

      itTokenPropagated('should propagate oauth token to updatePricingPlan service',
        () => externalSystemsMocks.provisioningServer.updatePricingPlanService);

      itTokenPropagated('should propagate oauth token to updateRatingPlan service',
        () => externalSystemsMocks.provisioningServer.updateRatingPlanService);
    });
  });
});
