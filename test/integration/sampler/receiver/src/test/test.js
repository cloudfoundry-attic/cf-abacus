'use strict';

const { MongoClient } = require('mongodb');
const { ReceiverClient } = require('abacus-api');
const createLifecycleManager = require('abacus-lifecycle-manager');

const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const receiverURI = 'https://localhost:7070';
const collectionName = 'spans';


describe('test receiver', () => {

  let mongoClient;

  before(async () => {
    mongoClient = await MongoClient.connect(mongoURI);
  });

  after(async () => {
    await mongoClient.close();
  });

  context('when start sampling...', () => {
    
    const usage = {
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

    let lifecycleManager;

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
      await client.collection(collectionName).drop();

      const receiverClient = new ReceiverClient(receiverURI);
      console.log('Before start');
      // await receiverClient.startSampling(usage);
      eventually(async () => await receiverClient.startSampling(usage));
      console.log('After start');
    });

    it('it should ...', () => {
      // const docs = receiverDb.findBy(usage);
      // const docs = spanDao.findBy(usage);
      // expect(doc).to.deepEqual([{}]);
      
      console.log('INN ITT');
    });

  });

});
