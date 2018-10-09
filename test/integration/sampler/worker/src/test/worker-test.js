'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const { extend } = require('underscore');
const { MongoClient } = require('mongodb');
const moment = require('abacus-moment');
const createLifecycleManager = require('abacus-lifecycle-manager');

const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const collectionName = 'spans';
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

const createCollectorServerMock = () => {
  let requests = [];
  let server;

  const serverMock = {
    start: async () => {
      const app = express();
      app.use(bodyParser.json());
      app.post('/v1/metering/collected/usage', (req, res) => {
        requests.push(req);
        res.status(202).send();
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

describe('Worker integration tests', () => {
  const clientId = 'client-id';
  const clientSecret = 'client-secret';
  const token = 'oauth-token';

  let lifecycleManager;
  let mongoClient;
  let collectorServerMock;
  let oauthServerMock;

  before(async () => {
    mongoClient = await MongoClient.connect(mongoURI);
    mongoClient.collection(collectionName).remove();

    collectorServerMock = createCollectorServerMock();
    await collectorServerMock.start();
    oauthServerMock = createOAuthServerMock(token);
    await oauthServerMock.start();
    const env = extend({}, process.env, {
      COLLECTOR: collectorServerMock.url(),
      AUTH_SERVER: oauthServerMock.url(),
      CLIENT_ID: clientId,
      CLIENT_SECRET: clientSecret,
      SECURED: 'true',
      CLUSTER: 'false'
    });

    lifecycleManager = createLifecycleManager();
    lifecycleManager.useEnv(env).startModules([
      lifecycleManager.modules.sampler.worker
    ]);
  });

  after(async () => {
    lifecycleManager.stopAllStarted();
    await mongoClient.close();
    await collectorServerMock.stop();
    await oauthServerMock.stop();
  });

  context('when new span is created in db', () => {
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

    const extractCredentials = (authHeader) => {
      const encodedCredentials = authHeader.split(' ')[1];
      const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString();
      const credentialsArray = decodedCredentials.split(':');

      return {
        clientId: credentialsArray[0],
        clientSecret: credentialsArray[1]
      };
    };

    it('it send correct clientId and clientSecret to UAA server', async () => {
      expect(oauthServerMock.requests().length).to.equal(1);
      expect(extractCredentials(oauthServerMock.requests()[0].headers.authorization)).to.deep.equal({
        clientId: clientId,
        clientSecret: clientSecret
      });
    });

    it('it should send usage to abacus collector', () => {
      expect(collectorServerMock.requests().length).to.equal(1);
      const [ request ] = collectorServerMock.requests();
      const usage = request.body;

      expect(usage.organization_id).to.equal(preparedDoc.target.organization_id);
      expect(usage.space_id).to.equal(preparedDoc.target.space_id);
      expect(usage.consumer_id).to.equal(preparedDoc.target.consumer_id);
      expect(usage.resource_id).to.equal(preparedDoc.target.resource_id);
      expect(usage.plan_id).to.equal(preparedDoc.target.plan_id);
      expect(usage.resource_instance_id).to.equal(preparedDoc.target.resource_instance_id);
      expect(usage.measured_usage.length).to.equal(2);

      expect(request.headers.authorization).to.equal(`Bearer ${token}`);
    });

  });

});

