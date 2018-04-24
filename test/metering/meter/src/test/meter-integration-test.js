'use strict';
const moment = require('abacus-moment');
process.env.CLUSTER = false;
const rabbitUri = 'amqp://localhost:5672';
const queueName = 'abacus-collect-queue';
const mockServer = require('./mock-server');
const accountStub = mockServer.app();
const accumStub = mockServer.app();
const provisioningStub = mockServer.app();
const { Producer, ConnectionManager } = require('abacus-rabbitmq');

const time = moment.now();
const usageDoc = {
  start: time,
  end: time,
  organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
  space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
  consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
  resource_id: 'test-resource',
  plan_id: 'basic',
  resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
  measured_usage: [
    {
      measure: 'light_api_calls',
      quantity: 12
    }
  ]
};

describe('test meter app', () => {

  const connectionManager = new ConnectionManager([rabbitUri]);
  const producer = new Producer(connectionManager, queueName);

  let sandbox;
  let server;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    console.log('========>');
    accumStub.reset('accum');
    accountStub.reset('account');
    provisioningStub.reset('prov');

    if(server)
      server.close();

    sandbox.reset();
  });

  context('when starting', () => {
    before(async() => {
      await producer.connect();
      await producer.send(usageDoc);
    });

    beforeEach(async() => {
      process.env.CLIENT_ID = '';
      process.env.CLIENT_SECRET = '';
      process.env.RABBIT_URI = rabbitUri;

      provisioningStub.returns.onFirstCall('/v1/provisioning/resources/test-resource/type',
        { statusCode: 200, body: 'resource-type' });
      provisioningStub.returns.onFirstCall('/v1/pricing/plans/test-pricing-plan-id',
        { statusCode: 200, body: { name: 'storage', price: 1 } });

      provisioningStub.startApp(9880);
      accountStub.returns.onFirstCall(`/v1/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/account/${time}`,
        { statusCode: 200, body: { account_id: 'test-account-id',
          pricing_country: 'test-pricing' , organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27' } });
      accountStub.returns.onFirstCall('/v1/metering/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/'
        + `resource-type/plans/basic/time/${time}/metering_plan/id`,
      { statusCode: 200, body:  'test-metering-plan' });
      accountStub.returns.onFirstCall('/v1/rating/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/' +
        `resource-type/plans/basic/time/${time}/rating_plan/id`,
      { statusCode: 200, body:  'test-rating-plan-id' });

      // TODO check countryPrices method in pconfig
      accountStub.returns.onFirstCall('/v1/pricing/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/' +
        `resource-type/plans/basic/time/${time}/pricing_plan/id`,
      { statusCode: 200, body: 'test-pricing-standard' });
      accountStub.startApp(9881);

      accumStub.returns.onFirstCall('/v1/metering/metered/usage', { statusCode: 201, body: 'CREATED' });
      accumStub.startApp(9200);


      const meterApp = require('abacus-usage-meter');
      server = await meterApp();

      await accumStub.waitUntil.alias('/v1/metering/metered/usage').isCalled(1);
    });

    it('consumes messages', () => {
      expect(accumStub.getCallCount('/v1/metering/metered/usage')).to.equal(1);
    });
  });


  context('when accumulator fails', () => {
    before(async() => {
      sandbox = sinon.sandbox.create();
      await producer.connect();
      await producer.send(usageDoc);
    });

    beforeEach(async() => {
      process.env.CLIENT_ID = '';
      process.env.CLIENT_SECRET = '';
      process.env.RABBIT_URI = rabbitUri;

      provisioningStub.returns.onFirstCall('/v1/provisioning/resources/test-resource/type',
        { statusCode: 200, body: 'resource-type' });
      provisioningStub.returns.onFirstCall('/v1/pricing/plans/test-pricing-plan-id',
        { statusCode: 200, body: { name: 'storage', price: 1 } });

      provisioningStub.startApp(9880);
      accountStub.returns.onFirstCall(`/v1/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/account/${time}`,
        { statusCode: 200, body: { account_id: 'test-account-id',
          pricing_country: 'test-pricing' , organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27' } });
      accountStub.returns.onFirstCall('/v1/metering/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/'
        + `resource-type/plans/basic/time/${time}/metering_plan/id`,
      { statusCode: 200, body:  'test-metering-plan' });
      accountStub.returns.onFirstCall('/v1/rating/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/' +
        `resource-type/plans/basic/time/${time}/rating_plan/id`,
      { statusCode: 200, body:  'test-rating-plan-id' });

      // TODO check countryPrices method in pconfig
      accountStub.returns.onFirstCall('/v1/pricing/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/' +
        `resource-type/plans/basic/time/${time}/pricing_plan/id`,
      { statusCode: 200, body: 'test-pricing-standard' });
      accountStub.startApp(9881);

      accumStub.returns.onFirstCall('/v1/metering/metered/usage', { statusCode: 500, body: {} });
      accumStub.returns.onSecondCall('/v1/metering/metered/usage', { statusCode: 201, body: 'CREATED' });
      accumStub.startApp(9200);


      const meterApp = require('abacus-usage-meter');
      server = await meterApp();

      await accumStub.waitUntil.alias('/v1/metering/metered/usage').isCalled(2);
    });



    it('should retry the message', () => {
      expect(accumStub.getCallCount('/v1/metering/metered/usage')).to.equal(2);
    });
  });
});
