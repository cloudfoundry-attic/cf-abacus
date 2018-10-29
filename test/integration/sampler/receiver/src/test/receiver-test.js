'use strict';

const { extend } = require('underscore');
const util = require('util');
const httpStatus = require('http-status-codes');
const { MongoClient } = require('mongodb');

const { ReceiverClient, 
  WebAppClient, 
  UnauthorizedError, 
  ForbiddenError,
  BasicAuthHeaderProvider,
  VoidAuthHeaderProvider } = require('abacus-api');
const moment = require('abacus-moment');

const { externalSystems, cfServerMock, uaaServerMock, provisioningServerMock } = require('abacus-mock-util');
const createLifecycleManager = require('abacus-lifecycle-manager');

const { createTokenFactory } = require('abacus-test-helper');

const createExternalSystems = externalSystems({
  uaaServer: uaaServerMock,
  cfServer: cfServerMock,
  provisioningServer: provisioningServerMock
});

const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const receiverURI = 'http://localhost:7070';
const collectionName = 'test-spans';

const delta = 10 * 1000;
const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

describe('Receiver integartion test', () => {
  const skipSslValidation = true;
  const provisioningPluginScopes = ['abacus.usage.write'];
  const healthcheckScopes = ['abacus.system.read'];
  const samplerOAuthScopes = ['abacus.sampler.write'];
  const jwtSecret = 'secret';
  const clientId = 'client-id';
  const clientSecret = 'client-secret';

  let tokenFactory;
  let lifecycleManager;
  let mongoClient;
  let validReceiverClient;
  let noScopesReceiverClient;
  let noAuthHeaderReceiverClient;

  let externalSystemsMocks;

  before(async () => {
    tokenFactory = createTokenFactory(jwtSecret);
    validReceiverClient = new ReceiverClient(receiverURI, {
      getHeader: () => `Bearer ${tokenFactory.create(samplerOAuthScopes)}`
    }, skipSslValidation);
    noScopesReceiverClient = new ReceiverClient(receiverURI, {
      getHeader: () => `Bearer ${tokenFactory.create([])}`
    }, skipSslValidation);
    noAuthHeaderReceiverClient = new ReceiverClient(receiverURI, new VoidAuthHeaderProvider(), skipSslValidation);


    externalSystemsMocks = createExternalSystems();
    await util.promisify(externalSystemsMocks.startAll)();

    externalSystemsMocks
      .cfServer
      .infoService
      .returnUaaAddress(externalSystemsMocks.uaaServer.url());

    externalSystemsMocks.provisioningServer.createMeteringMappingService.return.always(httpStatus.OK);
    externalSystemsMocks.provisioningServer.createRatingMappingService.return.always(httpStatus.OK);
    externalSystemsMocks.provisioningServer.createPricingMappingService.return.always(httpStatus.OK);

    const env = extend({}, process.env, {
      API: externalSystemsMocks.cfServer.url(),
      AUTH_SERVER: externalSystemsMocks.cfServer.url(),
      PROVISIONING: externalSystemsMocks.provisioningServer.url(),
      SPANS_COLLECTION_NAME: collectionName,
      SECURED: 'true',
      CLUSTER: 'false',
      JWTKEY: jwtSecret,
      JWTALGO: 'HS256',
      CLIENT_ID: clientId,
      CLIENT_SECRET: clientSecret
    });

    mongoClient = await MongoClient.connect(mongoURI);
    lifecycleManager = createLifecycleManager();
    lifecycleManager.useEnv(env).startModules([
      lifecycleManager.modules.sampler.receiver
    ]);
  });

  after(async () => {
    lifecycleManager.stopAllStarted();
    await util.promisify(externalSystemsMocks.stopAll)();
  });

  beforeEach(async () => {
    mongoClient.collection(collectionName).remove();
  });

  describe('#healthcheck', () => {
    const credentials = {
      username: 'user',
      password: 'pass'
    };
    let webappClient;

    before(async () => {
      const authHeaderProvider = new BasicAuthHeaderProvider(credentials);
      webappClient = new WebAppClient(receiverURI, authHeaderProvider, skipSslValidation);
    });

    context('when uaa server successfully validates passed credentials', () => {
      before(async () => {
        externalSystemsMocks.uaaServer.tokenService.clearRequests();
        const healthcheckToken = tokenFactory.create(healthcheckScopes);
        externalSystemsMocks
          .uaaServer
          .tokenService
          .whenScopesAre(healthcheckScopes)
          .return(healthcheckToken);
      });

      it('it responds with healthy status', async () => {
        expect(await eventually(async () => await webappClient.getHealth())).to.deep.equal({
          healthy: true
        });
      });
    });

    context('when uaa server rejects passed credentials', () => {
      before(async () => {
        externalSystemsMocks.uaaServer.tokenService.clearReturnValues();
      });

      it('it responds with "unauthorized" status', async () => {
        await eventually(async () => await expect(webappClient.getHealth()).to.be.rejectedWith(UnauthorizedError));
      });
    });
  });

  const itNoNeededScopes = (invokeEndpoint) => 
    context('when token with no needed scopes is used', () => {
      it('it should reject the request with "forbidden" status code', async () => {
        await eventually(async () => await expect(invokeEndpoint()).to.be.rejectedWith(ForbiddenError));
      });
    });

  const itNoAuthHeader = (invokeEndpoint) =>
    context('when no authorization header is sent', () => {
      it('it should reject the request with "unauthorized" status code', async () => {
        await eventually(async () => await expect(invokeEndpoint()).to.be.rejectedWith(UnauthorizedError));
      });
    });

  describe('#startSampling', () => {
    const usage = {
      id: 'dedup-guid',
      timestamp: moment.utc().valueOf(),
      organization_id: 'organization-guid',
      space_id: 'space-guid',
      consumer_id: 'consumer-guid',
      resource_id: 'resource-guid',
      plan_id: 'plan-guid',
      resource_instance_id: 'resource-instance-guid',
      measured_usage: [
        {
          measure: 'example',
          quantity: 10
        }
      ]
    };

    itNoAuthHeader(() => noAuthHeaderReceiverClient.startSampling(usage));
    itNoNeededScopes(() => noScopesReceiverClient.startSampling(usage));

    context('when start event is processed', () => {

      beforeEach(async () => {
        await eventually(async () => await validReceiverClient.startSampling(usage));
      });

      it('it should write a span to the db', async () => {
        const cursor = mongoClient.collection(collectionName).find({
          'target.organization_id': usage.organization_id,
          'target.space_id': usage.space_id,
          'target.consumer_id': usage.consumer_id,
          'target.resource_id': usage.resource_id,
          'target.plan_id': usage.plan_id,
          'target.resource_instance_id': usage.resource_instance_id,
          'target.correlation_id': ZERO_GUID
        });

        const docs = await cursor.toArray();
        expect(docs.length).to.be.equal(1);

        const span = docs[0];
        expect(span.start_dedup_id).to.equal(usage.id);
        expect(span.measured_usage).to.deep.equal(usage.measured_usage);
        expect(span.start).to.equal(usage.timestamp);
        expect(span.end).to.equal(null);
        expect(span.processing.complete).to.equal(false);
        expect(span.processing.last_interval).to.deep.equal({
          start: usage.timestamp,
          end: usage.timestamp
        });
        expect(span.processing.planned_interval).to.equal(null);
        expect(span.processing.last_change_at).to.be.closeTo(moment.now(), delta);
        expect(span.processing.version).to.equal(1);
      });

    });
  });

  describe('#stopSampling', () => {
    const usage = {
      id: 'dedup-guid',
      timestamp: moment.utc().valueOf(),
      organization_id: 'organization-guid',
      space_id: 'space-guid',
      consumer_id: 'consumer-guid',
      resource_id: 'resource-guid',
      plan_id: 'plan-guid',
      resource_instance_id: 'resource-instance-guid'
    };

    itNoAuthHeader(() => noAuthHeaderReceiverClient.stopSampling(usage));
    itNoNeededScopes(() => noScopesReceiverClient.stopSampling(usage));

    context('when stop event is processed', () => {
      const preparedDoc = {
        target: {
          organization_id: usage.organization_id,
          space_id: usage.space_id,
          consumer_id: usage.consumer_id,
          resource_id: usage.resource_id,
          plan_id: usage.plan_id,
          resource_instance_id: usage.resource_instance_id,
          correlation_id: ZERO_GUID
        },
        measured_usage: [
          {
            measure: 'example',
            quantity: 10
          }
        ],
        start: 123,
        end: null,
        processing: {
          complete: false,
          last_interval: {
            start: 123,
            end: 123
          },
          planned_interval: null,
          last_change_at: 1538035778531.0,
          version: 1
        },
        start_dedup_id: usage.id
      };

      beforeEach(async () => {
        await mongoClient.collection(collectionName).insertOne(preparedDoc);
        await eventually(async () => await validReceiverClient.stopSampling(usage));
      });

      it('it should update the span', async () => {
        const cursor = mongoClient.collection(collectionName).find({
          'target.organization_id': usage.organization_id,
          'target.space_id': usage.space_id,
          'target.consumer_id': usage.consumer_id,
          'target.resource_id': usage.resource_id,
          'target.plan_id': usage.plan_id,
          'target.resource_instance_id': usage.resource_instance_id
        });

        const docs = await cursor.toArray();
        expect(docs.length).to.be.equal(1);

        const span = docs[0];

        expect(span.target.correlation_id).to.not.equal(ZERO_GUID);
        expect(span.start_dedup_id).to.equal(usage.id);
        expect(span.end_dedup_id).to.equal(usage.id);
        expect(span.start).to.equal(preparedDoc.start);
        expect(span.end).to.equal(usage.timestamp);
        expect(span.end_is_set).to.equal(true);

        expect(span.measured_usage).to.deep.equal(preparedDoc.measured_usage);
        expect(span.processing).to.deep.equal(preparedDoc.processing);
      });
    });
  });

  describe('#createMappings', () => {
    const mapping = {
      resource_id: 'test-resource-id',
      plan_id: 'test-plan-id',
      metering_plan: 'test-metering-plan',
      rating_plan: 'test-rating-plan',
      pricing_plan: 'test-pricing-plan'
    };

    itNoAuthHeader(() => noAuthHeaderReceiverClient.createMappings(mapping));
    itNoNeededScopes(() => noScopesReceiverClient.createMappings(mapping));

    context('when create mappings is called', () => {
      let provisioningPluginToken;

      before(async () => {
        provisioningPluginToken = tokenFactory.create(provisioningPluginScopes);
        externalSystemsMocks
          .uaaServer
          .tokenService
          .whenScopesAre(provisioningPluginScopes)
          .return(provisioningPluginToken);
        await eventually(async () => await validReceiverClient.createMappings(mapping));
      });

      const verifyMappingCreated = (requests, plan) => {
        expect(requests.length).to.equal(1);
        expect(requests[0].mapping.resourceId).to.equal(mapping.resource_id);
        expect(requests[0].mapping.planId).to.equal(mapping.plan_id);
        expect(requests[0].mapping.plan).to.equal(plan);

        expect(requests[0].token).to.equal(provisioningPluginToken);
      };

      it('token for communication with the provisioning plugin is acquired', () => {
        const provisioningPluginTokenRequests = externalSystemsMocks
          .uaaServer
          .tokenService
          .requests
          .withScopes(provisioningPluginScopes);

        expect(provisioningPluginTokenRequests.length).to.equal(1);
        expect(provisioningPluginTokenRequests[0].credentials).to.deep.equal({
          clientId: clientId,
          secret: clientSecret
        });
      });

      it('metering mapping is created', () => {
        const requests = externalSystemsMocks.provisioningServer.createMeteringMappingService.requests();
        verifyMappingCreated(requests, mapping.metering_plan);
      });

      it('rating mapping is created', () => {
        const requests = externalSystemsMocks.provisioningServer.createRatingMappingService.requests();
        verifyMappingCreated(requests, mapping.rating_plan);
      });

      it('pricing mapping is created', () => {
        const requests = externalSystemsMocks.provisioningServer.createPricingMappingService.requests();
        verifyMappingCreated(requests, mapping.pricing_plan);
      });

    });
  });
});
