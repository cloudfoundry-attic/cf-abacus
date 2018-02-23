'use strict';
process.env.CLUSTER = false;
const rabbitUri = 'amqp://localhost:5672';
const queueName = 'abacus-collect-queue';
const mockServer = require('./mock-server');
const accountStub = mockServer.app();
const provisioningStub = mockServer.app();
const { Producer, ConnectionManager } = require('abacus-rabbitmq');

const usageDoc = {
  start: 1420243200000,
  end: 1420245000000,
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
    sandbox.restore();
  });

  context('when starting', () => {
    before(async() => {
      await producer.connect();
      await producer.send(usageDoc);
    });

    beforeEach((done) => {
      process.env.CLIENT_ID = '';
      process.env.CLIENT_SECRET = '';
      process.env.RABBIT_URI = rabbitUri;
      const cb = (req) => {
        console.log('REQ>>>>>>> ', req.path, req.body);
        if (req.path == '/batch' && req.body[0].uri == '/v1/metering/metered/usage')
          done();
      };
      const accumStub = require('./mock-server').app(cb);
      provisioningStub.addAlias('/v1/provisioning/resources/test-resource/type');
      provisioningStub.addResponse('/v1/provisioning/resources/test-resource/type',
        { statusCode: 200, body: 'resource-type' });
      provisioningStub.addResponse('/v1/pricing/plans/test-pricing-plan-id',
        { statusCode: 200, body: { name: 'storage', price: 1 } });

      provisioningStub.startApp(9880);
      accountStub.addResponse('/v1/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/account/1420245000000',
        { statusCode: 200, body: { account_id: 'test-account-id',
          pricing_country: 'test-pricing' , organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27' } });
      accountStub.addResponse('/v1/metering/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/' +
        'resource-type/plans/basic/time/1420245000000/metering_plan/id',
      { statusCode: 200, body:  'test-metering-plan' });
      accountStub.addResponse('/v1/rating/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/' +
        'resource-type/plans/basic/time/1420245000000/rating_plan/id',
      { statusCode: 200, body:  'test-rating-plan-id' });

      // TODO check countryPrices method in pconfig
      accountStub.addResponse('/v1/pricing/organizations/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/resource_types/' +
        'resource-type/plans/basic/time/1420245000000/pricing_plan/id',
      { statusCode: 200, body: 'test-pricing-standard' });
      accountStub.startApp(9881);
      accountStub.addAlias('/v1/metering/metered/usage');
      accumStub.addResponse('/v1/metering/metered/usage', { statusCode: 201, body: 'CREATED' });
      accumStub.startApp(9200);

      const meterApp = require('..');
      console.log('RUN');
      meterApp().then((s) => server = s);
      console.log('RDY');
    });

    afterEach(() => {
      // console.log(server);
      if(server)
        server.close();
    });

    it('consumes messages', () => {

      // expect(postStub.callCount).to.equal(1);
      // expect(provisioningStub.callCount).to.equal(1);
      // expect(accountStub.callCount).to.equal(1);
      // const consumerStub = sandbox.stub(Consumer.prototype, 'consume');

      // server = meterApp();

      // assert.calledOnce(consumerStub);
    });
  });

});
