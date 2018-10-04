'use strict';

const { ConflictError } = require('abacus-api');
const {
  Controller,
  ConflictingStartError,
  ConflictingEndError,
  MissingSpanError,
  OutOfOrderError,
  ConflictingMappingError
} = require('../lib/controller');

describe('Controller', () => {
  let spanDAO;
  let provisioningClient;
  let controller;

  beforeEach(() => {
    spanDAO = {
      startSpan: sinon.stub(),
      endSpan: sinon.stub(),
      getSpanByTarget: sinon.stub(),
      existsSpanWithStartDedupID: sinon.stub(),
      existsSpanWithEndDedupID: sinon.stub()
    };
    provisioningClient = {
      mapMeteringPlan: sinon.stub(),
      mapRatingPlan: sinon.stub(),
      mapPricingPlan: sinon.stub()
    };
    controller = new Controller({
      spanDAO: spanDAO,
      provisioningClient: provisioningClient
    });
  });

  describe('#handleStart', () => {
    const event = {
      id: 'dedup-id',
      timestamp: 1537365681000,
      organization_id: 'test-organization-id',
      space_id: 'test-space-id',
      consumer_id: 'test-consumer-id',
      resource_id: 'test-resource-id',
      plan_id: 'test-plan-id',
      resource_instance_id: 'test-resource-instance-id',
      measured_usage: [
        {
          measure: 'api_calls',
          quantity: 128
        }
      ]
    };

    beforeEach(() => {
      spanDAO.startSpan.callsFake(async () => {
        return true;
      });
    });

    it('starts a span', async () => {
      await controller.handleStart(event);

      assert.calledOnce(spanDAO.startSpan);
      assert.calledWithExactly(spanDAO.startSpan,
        event.timestamp,
        {
          organization_id: event.organization_id,
          space_id: event.space_id,
          consumer_id: event.consumer_id,
          resource_id: event.resource_id,
          plan_id: event.plan_id,
          resource_instance_id: event.resource_instance_id,
          correlation_id: '00000000-0000-0000-0000-000000000000'
        },
        event.measured_usage,
        event.id
      );
    });

    context('when start span returns a conflict', () => {
      beforeEach(() => {
        spanDAO.startSpan.callsFake(async () => {
          return false;
        });
      });

      context('when event is a duplicate', () => {
        beforeEach(() => {
          spanDAO.existsSpanWithStartDedupID.callsFake(async () => {
            return true;
          });
        });

        it('returns without any errors', async () => {
          await controller.handleStart(event);
        });
      });

      context('when event is not a duplicate', () => {
        beforeEach(() => {
          spanDAO.existsSpanWithStartDedupID.callsFake(async () => {
            return false;
          });
        });

        it('raises an error', async () => {
          await expect(controller.handleStart(event)).to.be.rejectedWith(ConflictingStartError);
        });
      });
    });
  });

  describe('#handleStop', () => {
    const span = {
      target: {
        organization_id: 'test-organization-id',
        space_id: 'test-space-id',
        consumer_id: 'test-consumer-id',
        resource_id: 'test-resource-id',
        plan_id: 'test-plan-id',
        resource_instance_id: 'test-resource-instance-id',
        correlation_id: '00000000-0000-0000-0000-000000000000'
      },
      start: 1537431759000
    };

    const nonZeroGuid = sinon.match((value) => {
      return value != undefined && value != '00000000-0000-0000-0000-000000000000';
    }, 'non zero guid');

    let event;

    beforeEach(() => {
      spanDAO.getSpanByTarget.callsFake(async () => {
        return span;
      });
      spanDAO.endSpan.callsFake(async () => {
        return true;
      });
      event = {
        id: 'dedup-id',
        timestamp: 1537431759000,
        organization_id: 'test-organization-id',
        space_id: 'test-space-id',
        consumer_id: 'test-consumer-id',
        resource_id: 'test-resource-id',
        plan_id: 'test-plan-id',
        resource_instance_id: 'test-resource-instance-id'
      };
    });

    it('ends a span', async () => {
      await controller.handleStop(event);

      assert.calledOnce(spanDAO.getSpanByTarget);
      assert.calledWithExactly(spanDAO.getSpanByTarget, span.target);

      assert.calledOnce(spanDAO.endSpan);
      assert.calledWithExactly(spanDAO.endSpan,
        event.timestamp,
        {
          organization_id: event.organization_id,
          space_id: event.space_id,
          consumer_id: event.consumer_id,
          resource_id: event.resource_id,
          plan_id: event.plan_id,
          resource_instance_id: event.resource_instance_id,
          correlation_id: '00000000-0000-0000-0000-000000000000'
        },
        nonZeroGuid,
        event.id
      );
    });

    context('when span for target does not exist', () => {
      beforeEach(() => {
        spanDAO.getSpanByTarget.callsFake(async () => {
          return undefined;
        });
      });

      context('when event is a duplicate', () => {
        beforeEach(() => {
          spanDAO.existsSpanWithEndDedupID.callsFake(async () => {
            return true;
          });
        });

        it('returns without any errors', async () => {
          await controller.handleStop(event);
        });
      });

      context('when event is not a duplicate', () => {
        beforeEach(() => {
          spanDAO.existsSpanWithEndDedupID.callsFake(async () => {
            return false;
          });
        });

        it('returns a missing span error', async () => {
          await expect(controller.handleStop(event)).to.be.rejectedWith(MissingSpanError);
        });
      });
    });

    context('when end timestamp is before existing span start', () => {
      beforeEach(() => {
        event.timestamp = span.start - 1;
      });

      it('returns a out of order error', async () => {
        await expect(controller.handleStop(event)).to.be.rejectedWith(OutOfOrderError);
      });
    });

    context('when end span returns a conflict', () => {
      beforeEach(() => {
        spanDAO.endSpan.callsFake(async () => {
          return false;
        });
      });

      context('when event is a duplicate', () => {
        beforeEach(() => {
          spanDAO.existsSpanWithEndDedupID.callsFake(async () => {
            return true;
          });
        });

        it('returns without any errors', async () => {
          await controller.handleStop(event);
        });
      });

      context('when event is not a duplicate', () => {
        beforeEach(() => {
          spanDAO.existsSpanWithEndDedupID.callsFake(async () => {
            return false;
          });
        });

        it('raises an error', async () => {
          await expect(controller.handleStop(event)).to.be.rejectedWith(ConflictingEndError);
        });
      });
    });
  });

  describe('#handleMappings', () => {
    const resourceID = 'mongodb';
    const planID = 'small';
    const meteringPlan = 'test-metering-plan';
    const ratingPlan = 'test-rating-plan';
    const pricingPlan = 'test-pricing-plan';
    const unknownErr = new Error('stubbed to fail');
    const conflictErr = new ConflictError();

    const handleMappings = async () => {
      await controller.handleMappings(resourceID, planID, meteringPlan, ratingPlan, pricingPlan);
    };

    it('calls the provisioning plugin', async () => {
      await handleMappings();

      assert.calledOnce(provisioningClient.mapMeteringPlan);
      assert.calledWithExactly(provisioningClient.mapMeteringPlan, resourceID, planID, meteringPlan);

      assert.calledOnce(provisioningClient.mapRatingPlan);
      assert.calledWithExactly(provisioningClient.mapRatingPlan, resourceID, planID, ratingPlan);

      assert.calledOnce(provisioningClient.mapPricingPlan);
      assert.calledWithExactly(provisioningClient.mapPricingPlan, resourceID, planID, pricingPlan);
    });

    context('when unknown error is thrown', () => {

      context('when map metering plan throws the error', () => {

        beforeEach(() => {
          provisioningClient.mapMeteringPlan.callsFake(async () => {
            throw unknownErr;
          });
        });

        it('the error is rethrown', async () => {
          await expect(handleMappings()).to.be.rejectedWith(unknownErr);
        });
      });

      context('when map rating plan throws the error', () => {

        beforeEach(() => {
          provisioningClient.mapRatingPlan.callsFake(async () => {
            throw unknownErr;
          });
        });

        it('the error is rethrown', async () => {
          await expect(handleMappings()).to.be.rejectedWith(unknownErr);
        });
      });

      context('when map pricing plan throws the error', () => {

        beforeEach(() => {
          provisioningClient.mapPricingPlan.callsFake(async () => {
            throw unknownErr;
          });
        });

        it('the error is rethrown', async () => {
          await expect(handleMappings()).to.be.rejectedWith(unknownErr);
        });
      });

    });

    context('when single mapping throws Conflict error', () => {

      context('when map metering plan throws Conflict error', () => {
        beforeEach(() => {
          provisioningClient.mapMeteringPlan.callsFake(async () => {
            throw conflictErr;
          });
        });
  
        it('the mapping is successfull', async () => {
          await expect(handleMappings());
        });
      });

      context('when map rating plan throws Conflict error', () => {
        beforeEach(() => {
          provisioningClient.mapRatingPlan.callsFake(async () => {
            throw conflictErr;
          });
        });
  
        it('the mapping is successfull', async () => {
          await expect(handleMappings());
        });
      });

      context('when map pricing plan throws Conflict error', () => {
        beforeEach(() => {
          provisioningClient.mapPricingPlan.callsFake(async () => {
            throw conflictErr;
          });
        });
  
        it('the mapping is successfull', async () => {
          await expect(handleMappings());
        });
      });
      
    });

    context('when all mappings throw Conflict error', () => {

      beforeEach(() => {
        provisioningClient.mapMeteringPlan.callsFake(async () => {
          throw conflictErr;
        });
        provisioningClient.mapRatingPlan.callsFake(async () => {
          throw conflictErr;
        });
        provisioningClient.mapPricingPlan.callsFake(async () => {
          throw conflictErr;
        });
      });

      it('ConflictingMappingError error is thrown', async () => {
        await expect(handleMappings()).to.be.rejectedWith(ConflictingMappingError);
      });

    });

  });
});
