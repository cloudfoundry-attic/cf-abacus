'use strict';
const moment = require('abacus-moment');
process.env.CLUSTER = false;
const rabbitUri = 'amqp://localhost:5672';
const queueNamePrefix = 'abacus-collect-queue';
const mockServer = require('./mock-server');

// const { Producer, ConnectionManager } = require('abacus-rabbitmq');
const rabbitClient = require('./rabbit-client');

const time = moment.now();

const orgId = 'org-id';
const resourceId = 'test-resource';
const planId = 'plan-id';
const provPluginResTypeUrl = `/v1/provisioning/resources/${resourceId}/type`;
const provPluginPricingPlanUrl = '/v1/pricing/plans/test-pricing-plan-id';
const accountPluginGetAccountUrl = `/v1/organizations/${orgId}/account/${time}`;
const accountUrl = (type) => `/v1/${type}/organizations/${orgId}/resource_types/` +
                  `resource-type/plans/${planId}/time/${time}/${type}_plan/id`;
const accumUrl = '/v1/metering/metered/usage';

const usageDoc = {
  start: time,
  end: time,
  organization_id: orgId,
  space_id: 'space-id',
  consumer_id: 'consumer-id',
  resource_id: resourceId,
  plan_id: planId,
  resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
  measured_usage: [
    {
      measure: 'light_api_calls',
      quantity: 12
    }
  ]
};

describe('test meter app', () => {
  let queueName;

  let sandbox;
  let server;
  let accountStub;
  let accumStub;
  let provisioningStub;

  beforeEach(async() => {
    accountStub = mockServer.app();
    accumStub = mockServer.app();
    provisioningStub = mockServer.app();

    delete process.env.ABACUS_COLLECT_QUEUE;
    queueName = queueNamePrefix + moment.now();
    process.env.ABACUS_COLLECT_QUEUE = queueName;
    // console.log(queueName);
    sandbox = sinon.sandbox.create();
    await rabbitClient.deleteQueue(queueName);
  });

  afterEach(async() => {
    accumStub.reset();
    accountStub.reset();
    provisioningStub.reset();

    await accumStub.close();
    await accountStub.close();
    await provisioningStub.close();

    if(server)
      server.close();

    sandbox.reset();
  });

  context('when starting', () => {

    beforeEach(async() => {
      process.env.CLIENT_ID = '';
      process.env.CLIENT_SECRET = '';
      process.env.RABBIT_URI = rabbitUri;

      provisioningStub.returns.onFirstCall(provPluginResTypeUrl,
        { statusCode: 200, body: 'resource-type' });
      provisioningStub.returns.onFirstCall(provPluginPricingPlanUrl,
        { statusCode: 200, body: { name: 'storage', price: 1 } });
      provisioningStub.startApp(9880);

      accountStub.returns.onFirstCall(accountPluginGetAccountUrl,
        { statusCode: 200, body: {
          account_id: 'id',
          pricing_country: 'country' ,
          organization_id: orgId } });
      accountStub.returns.onFirstCall(accountUrl('metering'), { statusCode: 200, body:  'test-metering-plan' });
      accountStub.returns.onFirstCall(accountUrl('rating'), { statusCode: 200, body:  'test-rating-plan-id' });
      // TODO check countryPrices method in pconfig
      accountStub.returns.onFirstCall(accountUrl('pricing'), { statusCode: 200, body: 'test-pricing-standard' });
      accountStub.startApp(9881);

      accumStub.returns.onFirstCall(accumUrl, { statusCode: 201, body: 'CREATED' });
      accumStub.startApp(9200);

      const meterApp = require('abacus-usage-meter');
      console.log(process.env.ABACUS_COLLECT_QUEUE);
      server = await meterApp();

      await rabbitClient.sendToQueue(queueName, usageDoc);

      await accumStub.waitUntil.alias(accumUrl).isCalled(1);
    });

    it('consumes messages', () => {
      expect(accumStub.getCallCount(accumUrl)).to.equal(1);
    });
  });


  context('when accumulator fails', () => {

    beforeEach(async() => {

      process.env.CLIENT_ID = '';
      process.env.CLIENT_SECRET = '';
      process.env.RABBIT_URI = rabbitUri;

      provisioningStub.returns.onFirstCall(provPluginResTypeUrl,
        { statusCode: 200, body: 'resource-type' });
      provisioningStub.returns.onFirstCall(provPluginPricingPlanUrl,
        { statusCode: 200, body: { name: 'storage', price: 1 } });
      provisioningStub.startApp(9880);

      accountStub.returns.onFirstCall(accountPluginGetAccountUrl,
        { statusCode: 200, body: {
          account_id: 'id',
          pricing_country: 'country' ,
          organization_id: orgId } });
      accountStub.returns.onFirstCall(accountUrl('metering'), { statusCode: 200, body:  'test-metering-plan' });
      accountStub.returns.onFirstCall(accountUrl('rating'), { statusCode: 200, body:  'test-rating-plan-id' });
      // TODO check countryPrices method in pconfig
      accountStub.returns.onFirstCall(accountUrl('pricing'), { statusCode: 200, body: 'test-pricing-standard' });
      accountStub.startApp(9881);

      accumStub.returns.onFirstCall(accumUrl, { statusCode: 500, body: {} });
      accumStub.returns.onSecondCall(accumUrl, { statusCode: 201, body: 'CREATED' });
      accumStub.startApp(9200);

      const meterApp = require('abacus-usage-meter');

      server = await meterApp();
      // const connectionManager = new ConnectionManager([rabbitUri]);
      // const producer = new Producer(connectionManager, queueName);
      // await producer.connect();
      // await producer.send(usageDoc);
      await rabbitClient.sendToQueue(queueName, usageDoc);
      console.log('dasdasda');
      await accumStub.waitUntil.alias(accumUrl).isCalled(2);
    });

    it('should retry the message', () => {
      expect(accumStub.getCallCount(accumUrl)).to.equal(2);
    });

  });

});
