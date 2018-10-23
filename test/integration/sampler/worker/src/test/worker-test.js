'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');
const { extend } = require('underscore');
const { MongoClient } = require('mongodb');
const { WorkerClient } = require('abacus-api');
const moment = require('abacus-moment');
const { externalSystems, cfServerMock, uaaServerMock, abacusCollectorMock } = require('abacus-mock-util');
const createLifecycleManager = require('abacus-lifecycle-manager');
const { createTokenFactory } = require('abacus-test-helper');

const createExternalSystems = externalSystems({
  uaaServer: uaaServerMock,
  cfServer: cfServerMock,
  abacusCollector: abacusCollectorMock
});

const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const workerURI = 'http://localhost:7071';
const collectionName = 'spans';
const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

describe('Worker integration tests', () => {
  const samplerResourceScopes = ['abacus.usage.sampler.write'];
  const healthcheckScopes = ['abacus.system.read'];

  const clientId = 'client-id';
  const clientSecret = 'client-secret';
  const jwtSecret = 'secret';
  const user = 'user';
  const password = 'password';

  let lifecycleManager;
  let mongoClient;
  let workerClient;
  let samplerResourceToken;

  let externalSystemsMocks;

  before(async () => {
    const credentials = Buffer.from(`${user}:${password}`).toString('base64');
    const tokenFactory = createTokenFactory(jwtSecret);
    workerClient = new WorkerClient(workerURI, {
      getHeader: () => `Basic ${credentials}`
    });
    mongoClient = await MongoClient.connect(mongoURI);
    mongoClient.collection(collectionName).remove();

    externalSystemsMocks = createExternalSystems();
    await util.promisify(externalSystemsMocks.startAll)();

    externalSystemsMocks
      .cfServer
      .infoService
      .returnUaaAddress(externalSystemsMocks.uaaServer.url());

    samplerResourceToken = tokenFactory.create(samplerResourceToken);
    externalSystemsMocks
      .uaaServer
      .tokenService
      .whenScopesAre(samplerResourceScopes)
      .return(samplerResourceToken);

    const healthcheckToken = tokenFactory.create(healthcheckScopes);
    externalSystemsMocks
      .uaaServer
      .tokenService
      .whenScopesAre(healthcheckScopes)
      .return(healthcheckToken);

    externalSystemsMocks
      .abacusCollector
      .collectUsageService
      .return
      .always(httpStatus.ACCEPTED);

    const env = extend({}, process.env, {
      COLLECTOR: externalSystemsMocks.abacusCollector.url(),
      AUTH_SERVER: externalSystemsMocks.cfServer.url(),
      API: externalSystemsMocks.cfServer.url(),
      CLIENT_ID: clientId,
      CLIENT_SECRET: clientSecret,
      SECURED: 'true',
      CLUSTER: 'false',
      JWTKEY: jwtSecret,
      JWTALGO: 'HS256'
    });

    lifecycleManager = createLifecycleManager();
    lifecycleManager.useEnv(env).startModules([
      lifecycleManager.modules.sampler.worker
    ]);
  });

  after(async () => {
    lifecycleManager.stopAllStarted();
    await mongoClient.close();
    await util.promisify(externalSystemsMocks.stopAll)();
  });

  describe('#span-processing', () => {

    context('when new span is received', () => {
      const docTimestamp = moment.utc().startOf('day').subtract(1, 'day').valueOf();
      const preparedDoc = {
        target: {
          organization_id: 'test-organization-id',
          space_id: 'test-space-id',
          consumer_id: 'test-consumer-id',
          resource_id: 'test-resource-id',
          plan_id: 'test-plan-id',
          resource_instance_id: 'test-resource-instance-id',
          correlation_id: ZERO_GUID
        },
        measured_usage: [
          {
            measure: 'example',
            quantity: 10
          }
        ],
        start: docTimestamp,
        end: null,
        processing: {
          complete: false,
          last_interval: {
            start: docTimestamp,
            end: docTimestamp
          },
          planned_interval: null,
          last_change_at: 1538035778531.0,
          version: 1
        },
        start_dedup_id: 'test-start-dedup-id'
      };

      const findSpan = async (target) => {
        return await mongoClient.collection(collectionName).findOne({
          'target.organization_id': target.organization_id,
          'target.space_id': target.space_id,
          'target.consumer_id': target.consumer_id,
          'target.resource_id': target.resource_id,
          'target.plan_id': target.plan_id,
          'target.resource_instance_id': target.resource_instance_id
        });
      };

      const spanIsProcessed = async () => {
        const span = await findSpan(preparedDoc.target);

        if (span.processing.last_interval.start == span.processing.last_interval.end)
          throw new Error('The span is not processed yet');
      };

      before(async () => {
        externalSystemsMocks.uaaServer.tokenService.clear();
        await mongoClient.collection(collectionName).insertOne(preparedDoc);
        await eventually(spanIsProcessed);
      });

      it('it should process the span', async () => {
        const span = await findSpan(preparedDoc.target);
        expect(span.processing.planned_interval).to.equal(null);
        expect(span.processing.last_change_at).to.not.equal(preparedDoc.processing.last_change_at);
        // One increase of version is expected when the span is planned, and one, when it's processed
        expect(span.processing.version).to.be.above(2);
      });

      it('it should aquire a token from UAA server', async () => {
        const samplerResourceTokenRequests = externalSystemsMocks
          .uaaServer
          .tokenService
          .requests
          .withScopes(samplerResourceScopes);

        expect(samplerResourceTokenRequests.length).to.equal(1);
        expect(samplerResourceTokenRequests[0].credentials).to.deep.equal({
          clientId: clientId,
          secret: clientSecret
        });
      });

      it('it should send an usage to abacus collector', () => {
        const collectorRequests = externalSystemsMocks
          .abacusCollector
          .collectUsageService
          .requests();

        expect(collectorRequests.length).to.equal(1);
        const usage = collectorRequests[0].usage;

        expect(usage.organization_id).to.equal(preparedDoc.target.organization_id);
        expect(usage.space_id).to.equal(preparedDoc.target.space_id);
        expect(usage.consumer_id).to.equal(preparedDoc.target.consumer_id);
        expect(usage.resource_id).to.equal(preparedDoc.target.resource_id);
        expect(usage.plan_id).to.equal(preparedDoc.target.plan_id);
        expect(usage.resource_instance_id).to.equal(preparedDoc.target.resource_instance_id);
        expect(usage.measured_usage.length).to.equal(2);

        expect(collectorRequests[0].token).to.equal(samplerResourceToken);
      });

    });
  });

  describe('#healthcheck', () => {

    context('when healthcheck is requested', () => {
      let health;

      before(async () => {
        externalSystemsMocks.uaaServer.tokenService.clear();
        health = await eventually(async () => await workerClient.getHealth());
      });
      
      it('it responds with healthy status', async () => {
        expect(health).to.deep.equal({
          healthy: true
        });
      });

      it('provided credentials are validated via uaa server', async () => {
        const healthcheckTokenRequests = externalSystemsMocks
          .uaaServer
          .tokenService
          .requests
          .withScopes(healthcheckScopes);

        expect(healthcheckTokenRequests.length).to.equal(1);
        expect(healthcheckTokenRequests[0].credentials).to.deep.equal({
          clientId: user,
          secret: password
        });
      });
    });

  });
});

