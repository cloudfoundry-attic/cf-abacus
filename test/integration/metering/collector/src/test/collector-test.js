'use strict';

const { extend } = require('underscore');
const httpStatus = require('http-status-codes');
const util = require('util');
const createLifecycleManager = require('abacus-lifecycle-manager');
const { CollectorClient, APIError, VoidAuthHeaderProvider } = require('abacus-api');

const {
  externalSystems,
  cfServerMock,
  uaaServerMock,
  provisioningServerMock,
  accountServerMock
} = require('abacus-mock-util');

const { createTokenFactory } = require('abacus-test-helper');

const createExternalSystems = externalSystems({
  uaaServer: uaaServerMock,
  cfServer: cfServerMock,
  provisioningServer: provisioningServerMock,
  accountServer: accountServerMock
});

describe('Collector tests', () => {
  const resourceId = 'resource-id';
  const usage = (organizationId) => ({
    start: 123,
    end: 123,
    organization_id: organizationId,
    space_id: 'space-id',
    resource_id: resourceId,
    plan_id: 'plan-id',
    resource_instance_id: 'resource-instance-id',
    consumer_id: 'consumer-id',
    measured_usage: [
      { measure: 'light_api_calls', quantity: 1000 }
    ]
  });

  const collectorUrl = 'http://localhost:9080';
  const systemScopes = ['abacus.usage.read', 'abacus.usage.write'];
  const jwtSecret = 'jwt-secret';

  let lifecycleManager;
  let externalSystemsMocks;
  let tokenFactory;
  let token;

  let systemCollectorClient;
  let internalResourceCollectorClient;
  let resourceCollectorClient;

  before(async () => {
    externalSystemsMocks = createExternalSystems();
    await util.promisify(externalSystemsMocks.startAll)();

    tokenFactory = createTokenFactory(jwtSecret);
    token = tokenFactory.create(systemScopes);
    externalSystemsMocks
      .uaaServer
      .tokenService
      .whenScopesAre(systemScopes)
      .return(token);

    externalSystemsMocks
      .cfServer
      .infoService
      .returnUaaAddress(externalSystemsMocks.uaaServer.url());

    externalSystemsMocks.provisioningServer.validateResourceInstanceService.return.always(httpStatus.OK);
    externalSystemsMocks.accountServer.getAccountService.return.always(httpStatus.OK);

    lifecycleManager = createLifecycleManager();

    const env = extend({}, process.env, {
      API: externalSystemsMocks.cfServer.url(),
      AUTH_SERVER: externalSystemsMocks.cfServer.url(),
      PROVISIONING: externalSystemsMocks.provisioningServer.url(),
      ACCOUNT: externalSystemsMocks.accountServer.url(),
      JWTKEY: jwtSecret,
      JWTALGO: 'HS256',
      SECURED: true
    });

    lifecycleManager.useEnv(env).startModules([
      lifecycleManager.modules.collector
    ]);

    systemCollectorClient = new CollectorClient(collectorUrl, {
      authHeaderProvider: {
        getHeader: () => `Bearer ${tokenFactory.create(['abacus.usage.write'])}`
      }
    });
    resourceCollectorClient = new CollectorClient(collectorUrl, {
      authHeaderProvider: {
        getHeader: () => `Bearer ${tokenFactory.create([`abacus.usage.${resourceId}.write`])}`
      }
    });

    internalResourceCollectorClient = new CollectorClient(collectorUrl, {
      authHeaderProvider: {
        getHeader: () => `Bearer ${tokenFactory.create(['abacus.usage.sampler.write'])}`
      }
    });

  });

  after(async () => {
    lifecycleManager.stopAllStarted();
    await util.promisify(externalSystemsMocks.stopAll)();
  });


  const contextSuccessfulUsagePost = (name, postUsage) =>
    context(name, () => {

      before(async() => {
        externalSystemsMocks.provisioningServer.validateResourceInstanceService.clear();
        externalSystemsMocks.accountServer.getAccountService.clear();
        await eventually(postUsage);
      });

      const itTokenPropagated = (name, serviceMock) =>
        it(name, async () => {
          const requests = serviceMock().requests();
          expect(requests.length).to.equal(1);
          expect(requests[0].token).to.equal(token);
        });

      itTokenPropagated('should propagate oauth token to provisioning plugin',
        () => externalSystemsMocks.provisioningServer.validateResourceInstanceService);

      itTokenPropagated('should propagate oauth token to account plugin',
        () => externalSystemsMocks.accountServer.getAccountService);
    });


  contextSuccessfulUsagePost('when a system client posts the usage',
    async () => await systemCollectorClient.postUsage(usage('organization-id-system')));

  contextSuccessfulUsagePost('when a internal resource client posts the usage',
    async () => await internalResourceCollectorClient.postUsage(usage('organization-id-internal')));

  contextSuccessfulUsagePost('when resource client posts the usage',
    async () => await resourceCollectorClient.postUsage(usage('organization-id-resource')));


  context('when no authorization header is sent', () => {
    const noAuthHeaderCollectorClient = new CollectorClient(collectorUrl, {
      authHeaderProvider: new VoidAuthHeaderProvider()
    });

    it('it should reject the usage with "unauthorized" status code', async () => {
      await eventually(
        async () => await expect(noAuthHeaderCollectorClient.postUsage(usage('organization-id-unauthorized')))
          .to.be.eventually.rejectedWith(APIError)
          .and.have.property('statusCode', httpStatus.UNAUTHORIZED)
      );
    });
  });

  context('when token with no needed scopes is used', () => {
    const noScopesCollectorClient = new CollectorClient(collectorUrl, {
      authHeaderProvider: {
        getHeader: () => `Bearer ${tokenFactory.create([])}`
      }
    });;

    it('it should reject the usage with "forbidden" status code', async () => {
      await eventually(
        async () => await expect(noScopesCollectorClient.postUsage(usage('organization-id-forbidden')))
          .to.be.eventually.rejectedWith(APIError)
          .and.have.property('statusCode', httpStatus.FORBIDDEN)
      );
    });
  });


});
