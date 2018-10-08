'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const { extend } = require('underscore');
const { MongoClient } = require('mongodb');
const { ReceiverClient } = require('abacus-api');
const moment = require('abacus-moment');
const createLifecycleManager = require('abacus-lifecycle-manager');

const createTokenFactoy = require('./token-factory');

const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const receiverURI = 'http://localhost:7070';
const collectionName = 'spans';

const delta = 10 * 1000;
const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

const createOAuthServerMock = (responseToken) => {
  let requests = [];
  let server;

  const serverMock = {
    start: async () => {
      const app = express();
      app.use(bodyParser.json());

      app.get('/v2/info', (req, res) => {
        res.send({
          token_endpoint: serverMock.url()
        });
      });

      app.post('/oauth/token', (req, res) => {
        requests.push(req);
        res.status(httpStatus.OK).send({
          access_token: responseToken,
          expires_in: 5 * 60
        });
      });

      server = http.createServer(app);
      const listen = util.promisify(server.listen).bind(server);
      await listen(0);
    },
    stop: async () => {
      await server.close();
    },
    url: () => `http://localhost:${server.address().port}`,
    requests: () => requests
  };

  return serverMock;
};


const createProvisioningServerMock = () => {
  let meteringRequests = [];
  let ratingRequests = [];
  let pricingRequests = [];
  let server;

  return {
    start: async () => {
      const app = express();
      app.use(bodyParser.json());
      app.post('/v1/provisioning/mappings/metering/resources/:resourceId/plans/:planId/:meteringPlan', (req, res) => {
        meteringRequests.push(req);
        res.status(200).send();
      });
      app.post('/v1/provisioning/mappings/rating/resources/:resourceId/plans/:planId/:ratingPlan', (req, res) => {
        ratingRequests.push(req);
        res.status(200).send();
      });
      app.post('/v1/provisioning/mappings/pricing/resources/:resourceId/plans/:planId/:pricingPlan', (req, res) => {
        pricingRequests.push(req);
        res.status(200).send();
      });

      server = http.createServer(app);
      const listen = util.promisify(server.listen).bind(server);
      await listen(0);
    },
    stop: async () => {
      await server.close();
    },
    url: () => `http://localhost:${server.address().port}`,
    requests: () => ({
      metering: meteringRequests,
      rating: ratingRequests,
      pricing: pricingRequests
    })
  };
};

describe('Receiver integartion test', () => {
  const token = 'token';
  const samplerOAuthScopes = ['abacus.sampler.usage.write'];
  const jwtSecret = 'secret';
  const clientId = 'client-id';
  const clientSecret = 'client-secret';
  let tokenFactory;
  let lifecycleManager;
  let mongoClient;
  let receiverClient;
  let provisioningServerMock;
  let oauthServerMock;

  before(async () => {
    tokenFactory = createTokenFactoy(jwtSecret);
    const receiverToken = tokenFactory.create(samplerOAuthScopes);
    receiverClient = new ReceiverClient(receiverURI, {
      getHeader: () => `Bearer ${receiverToken}`
    });
    mongoClient = await MongoClient.connect(mongoURI);
    provisioningServerMock = createProvisioningServerMock();
    await provisioningServerMock.start();

    oauthServerMock = createOAuthServerMock(token);
    await oauthServerMock.start();

    const env = extend({}, process.env, {
      AUTH_SERVER: oauthServerMock.url(),
      PROVISIONING: provisioningServerMock.url(),
      SECURED: 'true',
      JWTKEY: jwtSecret,
      JWTALGO: 'HS256',
      CLIENT_ID: clientId,
      CLIENT_SECRET: clientSecret
    });

    lifecycleManager = createLifecycleManager();
    lifecycleManager.useEnv(env).startModules([
      lifecycleManager.modules.sampler.receiver
    ]);
  });

  after(async () => {
    lifecycleManager.stopAllStarted();
    await mongoClient.close();
    await provisioningServerMock.stop();
    await oauthServerMock.stop();
  });

  beforeEach(async () => {
    mongoClient.collection(collectionName).remove();
  });

  describe('#startSampling', () => {
    context('when start event is received', () => {

      const usage = {
        id: 'dedup-guid',
        timestamp: 123,
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

      beforeEach(async () => {
        await eventually(async () => await receiverClient.startSampling(usage));
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

    context('when stop event is received', () => {
      const usage = {
        id: 'dedup-guid',
        timestamp: 789,
        organization_id: 'organization-guid',
        space_id: 'space-guid',
        consumer_id: 'consumer-guid',
        resource_id: 'resource-guid',
        plan_id: 'plan-guid',
        resource_instance_id: 'resource-instance-guid'
      };

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
        await eventually(async () => await receiverClient.stopSampling(usage));
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

        expect(span.measured_usage).to.deep.equal(preparedDoc.measured_usage);
        expect(span.processing).to.deep.equal(preparedDoc.processing);
      });
    });
  });

  describe('#createMappings', () => {

    context('when create mappings is called', () => {
      const mapping = {
        resource_id: 'test-resource-id',
        plan_id: 'test-plan-id',
        metering_plan: 'test-metering-plan',
        rating_plan: 'test-rating-plan',
        pricing_plan: 'test-pricing-plan'
      };

      before(async () => {
        await eventually(async () => await receiverClient.createMappings(mapping));
      });

      const extractCredentials = (authHeader) => {
        const encodedCredentials = authHeader.split(' ')[1];
        const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString();
        const credentialsArray = decodedCredentials.split(':');
  
        return {
          clientId: credentialsArray[0],
          clientSecret: credentialsArray[1]
        };
      };

      it('oauth server is properly called', () => {
        // Expect 2 calls because of CLUSTER=true env var
        expect(oauthServerMock.requests().length).to.equal(2);
        const [req] = oauthServerMock.requests();
        expect(extractCredentials(req.headers.authorization)).to.deep.equal({
          clientId: clientId,
          clientSecret: clientSecret
        });
      });

      it('metering mapping is created', () => {
        expect(provisioningServerMock.requests().metering.length).to.equal(1);
        const req = provisioningServerMock.requests().metering[0];
        expect(req.params.resourceId).to.equal(mapping.resource_id);
        expect(req.params.planId).to.equal(mapping.plan_id);
        expect(req.params.meteringPlan).to.equal(mapping.metering_plan);

        expect(req.headers.authorization).to.equal(`Bearer ${token}`);
      });

      it('rating mapping is created', () => {
        expect(provisioningServerMock.requests().rating.length).to.equal(1);
        const req = provisioningServerMock.requests().rating[0];
        expect(req.params.resourceId).to.equal(mapping.resource_id);
        expect(req.params.planId).to.equal(mapping.plan_id);
        expect(req.params.ratingPlan).to.equal(mapping.rating_plan);

        expect(req.headers.authorization).to.equal(`Bearer ${token}`);
      });

      it('pricing mapping is created', () => {
        expect(provisioningServerMock.requests().pricing.length).to.equal(1);
        const req = provisioningServerMock.requests().pricing[0];
        expect(req.params.resourceId).to.equal(mapping.resource_id);
        expect(req.params.planId).to.equal(mapping.plan_id);
        expect(req.params.pricingPlan).to.equal(mapping.pricing_plan);

        expect(req.headers.authorization).to.equal(`Bearer ${token}`);
      });

    });

  });

});
