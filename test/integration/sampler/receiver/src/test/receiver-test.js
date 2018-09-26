'use strict';

// const { omit } = require('underscore');

const { MongoClient } = require('mongodb');
const { ReceiverClient } = require('abacus-api');
const moment = require('abacus-moment');
const createLifecycleManager = require('abacus-lifecycle-manager');

const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const receiverURI = 'http://localhost:7070';
const collectionName = 'spans';

const delta = 10 * 1000;

describe('Receiver integartion test', () => {

  let mongoClient;

  before(async () => {
    mongoClient = await MongoClient.connect(mongoURI);
  });

  after(async () => {
    await mongoClient.close();
  });

  describe('#startSampling', () => {
    context('when start event is received', () => {
      let lifecycleManager;
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

      before(() => {
        lifecycleManager = createLifecycleManager();
        lifecycleManager.startModules([
          lifecycleManager.modules.sampler.receiver
        ]);
      });

      after(() => {
        lifecycleManager.stopAllStarted();
      });

      beforeEach(async () => {
        await mongoClient.collection(collectionName).drop();

        const receiverClient = new ReceiverClient(receiverURI);
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
          'target.correlation_id': '00000000-0000-0000-0000-000000000000'
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

});
