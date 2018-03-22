'use strict';

const { extend } = require('underscore');
const createMeter = require('../lib/meter');

describe('test meter', () => {

  describe('when metering usage', () => {
    let meter;
    let sandbox;
    let planStub;
    let meterFnStub;
    let planRetrieverStub;

    const usageDoc = {
      start: 1,
      end: 2,
      metering_plan_id: 'test-metering-plan-id',
      measured_usage: [
        {
          measure: 'test-measure',
          quantity: 2000
        }
      ]
    };

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      planRetrieverStub = {
        getPlan: sandbox.stub()
      };
      meterFnStub = sandbox.stub();
      planStub = { metering_plan: {
        metrics: [
          {
            name: 'test-metric',
            unit: 'test-unit',
            type: 'discrete',
            meterfn: meterFnStub
          }
        ]
      } };
      meter = createMeter(planRetrieverStub);
    });

    afterEach(() => {
      sandbox.restore();
    });

    context('when no error occurs', () => {
      const meterFunctionResult = 10;
      beforeEach(() => {
        meterFnStub.returns(meterFunctionResult);
        planRetrieverStub.getPlan.resolves(planStub);
      });

      it('returns expected metered_usage', async() => {
        const meterDoc = await meter.meterUsage(usageDoc);
        expect(meterDoc).to.deep.equal(extend({}, usageDoc, {
          metered_usage: [
            {
              metric: 'test-metric',
              quantity: meterFunctionResult
            }
          ]
        }));
      });
    });

    context('when an error occurs', () => {
      context('when getPlan throws error', () => {
        beforeEach(() => {
          planRetrieverStub.getPlan.rejects();
        });

        it('meterUsage rethrows the error', async() => {
          await assertPromise.isRejected(meter.meterUsage(usageDoc), 'Failed to read metering plan');
        });
      });

      context('when getPlan returns plan containing error', () => {
        beforeEach(() => {
          planRetrieverStub.getPlan.resolves({ error: 'some error' });
        });

        it('meterUsage rethrows the error', async() => {
          await assertPromise.isRejected(meter.meterUsage(usageDoc), 'Failed to read metering plan');
        });
      });

      context('when meter function throws error', () => {
        beforeEach(() => {
          planRetrieverStub.getPlan.resolves(planStub);
          meterFnStub.throws();
        });

        it('meterUsage throws isPlanBusinessError error', async() => {
          let error;
          try {
            await meter.meterUsage(usageDoc);
          } catch(e) {
            error = e;
          }
          expect(error.isPlanBusinessError).to.equal(true);
        });
      });
    });
  });
});
