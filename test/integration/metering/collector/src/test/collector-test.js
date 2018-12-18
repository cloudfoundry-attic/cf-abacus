'use strict';

const { extend, omit } = require('underscore');
const httpStatus = require('http-status-codes');
const util = require('util');
const createLifecycleManager = require('abacus-lifecycle-manager');
const { CollectorClient, APIError, BadRequestError, VoidAuthHeaderProvider } = require('abacus-api');
const { ConnectionManager, Consumer, amqpMessageParser } = require('abacus-rabbitmq');

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

const rabbitUri = process.env.RABBIT_URI || 'amqp://localhost:5672';
const consumerConfig = {
  mainQueue: {
    name: 'collector-itest-queue',
    exchange: 'collector-itest-main-exchange',
    routingKey: '#',
    prefetchLimit: 100
  },
  deadLetterQueues: [
    {
      name: 'collector-itest-first-dl',
      exchange: 'collector-itest-first-dl-exchange',
      mainExchange: 'collector-itest-main-exchange',
      routingKey: '#',
      ttl: 180000,
      retryAttempts: 100
    },
    {
      name: 'collector-itest-second-dl',
      exchange: 'collector-itest-second-dl-exchange',
      mainExchange: 'collector-itest-main-exchange',
      routingKey: '#',
      ttl: 1620000,
      retryAttempts: 100
    }
  ]
};

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

    externalSystemsMocks.uaaServer.tokenService.whenScopesAre(systemScopes).return(token);
    externalSystemsMocks.cfServer.infoService.returnUaaAddress(externalSystemsMocks.uaaServer.url());

    lifecycleManager = createLifecycleManager();

    const env = extend({}, process.env, {
      API: externalSystemsMocks.cfServer.url(),
      AUTH_SERVER: externalSystemsMocks.cfServer.url(),
      PROVISIONING: externalSystemsMocks.provisioningServer.url(),
      ACCOUNT: externalSystemsMocks.accountServer.url(),
      JWTKEY: jwtSecret,
      JWTALGO: 'HS256',
      SECURED: true,
      ABACUS_COLLECT_QUEUE: consumerConfig.mainQueue.name
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

  const contextSuccessfulUsagePost = (name, client, usage) =>
    context(name, () => {
      let connectionManager;

      before(async() => {
        connectionManager = new ConnectionManager([rabbitUri]);

        externalSystemsMocks.provisioningServer.validateResourceInstanceService.clear();
        externalSystemsMocks.accountServer.getAccountService.clear();
        externalSystemsMocks.provisioningServer.validateResourceInstanceService.return.always({
          statusCode: httpStatus.OK
        });
        externalSystemsMocks.accountServer.getAccountService.return.always({
          statusCode: httpStatus.OK
        });

        await eventually(async () => await client().postUsage(usage));
      });

      after(async () => {
        await connectionManager.disconnect();
      });

      const itTokenPropagated = (name, serviceMock) =>
        it(name, async () => {
          const requests = serviceMock().requests();
          expect(requests.length).to.equal(1);
          expect(requests[0].token).to.equal(token);
        });

      itTokenPropagated('it should propagate oauth token to provisioning plugin',
        () => externalSystemsMocks.provisioningServer.validateResourceInstanceService);

      itTokenPropagated('it should propagate oauth token to account plugin',
        () => externalSystemsMocks.accountServer.getAccountService);


      it('it should write the usage in rabbitMQ', (done) => {
        const consumer = new Consumer(connectionManager, amqpMessageParser, consumerConfig);
        const handleMessage = (message) => {
          const receivedUsage = message.usageDoc;
          try {
            expect(omit(receivedUsage, 'processed_id')).to.deep.equal(usage);
            done();
          } catch (e) {
            done(e);
          }
        };
        consumer.process({ handle: handleMessage });
      });
    });

  context('when usage is successfully posted to collector', () => {

    contextSuccessfulUsagePost(
      'when a system client posts the usage',
      () => systemCollectorClient,
      usage('organization-id-system')
    );

    contextSuccessfulUsagePost(
      'when an internal resource client posts the usage',
      () => internalResourceCollectorClient,
      usage('organization-id-internal')
    );

    contextSuccessfulUsagePost(
      'when a resource client posts the usage',
      () => resourceCollectorClient,
      usage('organization-id-resource')
    );

  });

  context('when usage has invalid schema', () => {

    it('it should reject the usage with "bad request" status code and proper description', async () => {
      const badRequestError = await eventually(
        async () => await expect(systemCollectorClient.postUsage({})).to.be.eventually.rejectedWith(BadRequestError)
      );

      expect(badRequestError.statusCode).to.equals(httpStatus.BAD_REQUEST);
      expect(badRequestError.message).to.equals('Invalid usage: invalid schema');
    });
  });

  context('when usage refers invalid resource instance', () => {

    before(async() => {
      externalSystemsMocks.provisioningServer.validateResourceInstanceService.return.always({
        statusCode: httpStatus.NOT_FOUND,
        body: {
          error: 'resource instance not found'
        }
      });
      externalSystemsMocks.accountServer.getAccountService.return.always({
        statusCode: httpStatus.OK
      });
    });

    it('it should reject the usage with "bad request" status code and proper description', async () => {
      const badRequestError = await eventually(
        async () => await expect(systemCollectorClient.postUsage(usage('organization-id-invalid-resource-instance')))
          .to.be.eventually.rejectedWith(BadRequestError)
      );

      expect(badRequestError.statusCode).to.equals(httpStatus.BAD_REQUEST);
      expect(badRequestError.message).to.equals('Invalid usage: invalid resource instance');
    });
  });

  context('when usage refers invalid account', () => {

    before(async() => {
      externalSystemsMocks.provisioningServer.validateResourceInstanceService.return.always({
        statusCode: httpStatus.OK
      });
      externalSystemsMocks.accountServer.getAccountService.return.always({
        statusCode: httpStatus.NOT_FOUND,
        body: {
          error: 'account not found'
        }
      });
    });

    it('it should reject the usage with "bad request" status code and proper description', async () => {
      const badRequestError = await eventually(
        async () => await expect(systemCollectorClient.postUsage(usage('organization-id-invalid-account')))
          .to.be.eventually.rejectedWith(BadRequestError)
      );

      expect(badRequestError.statusCode).to.equals(httpStatus.BAD_REQUEST);
      expect(badRequestError.message).to.equals('Invalid usage: not existing account');
    });
  });

  context('when account plugin is down', () => {

    before(async() => {
      externalSystemsMocks.provisioningServer.validateResourceInstanceService.return.always({
        statusCode: httpStatus.OK
      });
      externalSystemsMocks.accountServer.getAccountService.return.always({
        statusCode: httpStatus.NOT_FOUND
      });
    });

    it('it should reject the usage with "internal server error" status code', async () => {
      const badRequestError = await eventually(
        async () => await expect(systemCollectorClient.postUsage(usage('organization-id-account-down')))
          .to.be.eventually.rejectedWith(APIError)
      );

      expect(badRequestError.statusCode).to.equals(httpStatus.INTERNAL_SERVER_ERROR);
    });

  });

  context('when provisioning plugin is down', () => {

    before(async() => {
      externalSystemsMocks.provisioningServer.validateResourceInstanceService.return.always({
        statusCode: httpStatus.NOT_FOUND
      });
      externalSystemsMocks.accountServer.getAccountService.return.always({
        statusCode: httpStatus.OK
      });
    });

    it('it should reject the usage with "internal server error" status code', async () => {
      const badRequestError = await eventually(
        async () => await expect(systemCollectorClient.postUsage(usage('organization-id-provisioning-down')))
          .to.be.eventually.rejectedWith(APIError)
      );

      expect(badRequestError.statusCode).to.equals(httpStatus.INTERNAL_SERVER_ERROR);
    });

  });

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
    });

    it('it should reject the usage with "forbidden" status code', async () => {
      await eventually(
        async () => await expect(noScopesCollectorClient.postUsage(usage('organization-id-forbidden')))
          .to.be.eventually.rejectedWith(APIError)
          .and.have.property('statusCode', httpStatus.FORBIDDEN)
      );
    });
  });


});
