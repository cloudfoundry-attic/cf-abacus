'use strict';

const { createCollector } = require('../lib/collector');

describe('Collector', () => {
  const processedId = 'processedId';

  const usage = {
    start: 123,
    end: 789,
    processed_id: processedId,
    organization_id: 'org-id',
    space_id: 'space-id',
    consumer_id: 'consumer-id',
    resource_id: 'test-resource',
    plan_id: 'basic',
    resource_instance_id: 'resource-instsance-id',
    measured_usage: [
      {
        measure: 'light_api_calls',
        quantity: 12
      }
    ]
  };

  let validatorStub;
  let producerStub;
  let collector;

  beforeEach(() => {
    validatorStub = {
      validate: sinon.stub()
    };
    producerStub = {
      send: sinon.stub()
    };
    collector = createCollector(validatorStub, producerStub);
  });

  context('when usage is valid', () => {

    beforeEach(async () => {
      await collector.collect(usage);
    });

    it('should validate the usage', async() => {
      assert.calledOnce(validatorStub.validate);
      const noProcessIdUsage = {
        start: 123,
        end: 789,
        organization_id: 'org-id',
        space_id: 'space-id',
        consumer_id: 'consumer-id',
        resource_id: 'test-resource',
        plan_id: 'basic',
        resource_instance_id: 'resource-instsance-id',
        measured_usage: [
          {
            measure: 'light_api_calls',
            quantity: 12
          }
        ]
      };
      assert.calledWithExactly(validatorStub.validate, noProcessIdUsage);
    });

    it('should send the usage', async() => {
      assert.calledOnce(producerStub.send);
      assert.calledWithExactly(producerStub.send, usage);
    });
  });

  context('when usage is invalid', () => {
    const errorMessage = 'error message';

    beforeEach(async () => {
      validatorStub.validate.callsFake(async () => {
        throw new Error(errorMessage);
      }) ;
    });

    it('should not send the usage', async() => {
      await expect(collector.collect(usage)).to.be.rejectedWith(Error, errorMessage);
      assert.notCalled(producerStub.send);
    });

  });

});
