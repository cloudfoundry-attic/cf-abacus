'use strict';

const { extend } = require('underscore');
const Meter = require('../lib/meter');

describe('test meter', () => {

  describe('create Meter', () => {
    context('when retriever has getPlan function', () => {
      it('exception is not thrown', () => {
        const retriever = { getPlan: () => {} };
        expect(() => new Meter(retriever)).not.to.throw();
      });
    });
  });

  describe('when metering usage', () => {
    let meterFnStub;
    let planStub;

    let planRetrieverStub;
    let sandbox;

    let meter;

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
      planStub = {
        metrics: [
          {
            name: 'test-metric',
            unit: 'test-unit',
            type: 'discrete',
            meterfn: meterFnStub
          }
        ]
      };
      meter = new Meter(planRetrieverStub);
    });

    afterEach(() => {
      sandbox.restore();
    });

    context('when no error occurs', () => {
      const meterFunctionResult = 10;

      beforeEach(() => {
        meterFnStub.returns(meterFunctionResult);
        planRetrieverStub.getPlan.returns(Promise.resolve(planStub));
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

      const verifyThrownError = async(fn, verifyErrorFn) => {
        let error;
        try {
          await meter.meterUsage(usageDoc);
        } catch (e) {
          error = e;
        }

        verifyErrorFn(error);
      };

      const itErrorIsRethrown = () =>
        it('meterUsage rethrows the error', async() => {
          await verifyThrownError(meter.meterUsage, (err) => {
            expect(err.message).include('Failed to read metering plan');
          });
        });

      context('when getPlan throws error', () => {
        beforeEach(() => {
          planRetrieverStub.getPlan.returns(Promise.reject());
        });

        itErrorIsRethrown();
      });

      context('when getPlan returns plan containing error', () => {
        beforeEach(() => {
          planRetrieverStub.getPlan.returns(Promise.resolve({ error: 'some error' }));
        });

        itErrorIsRethrown();
      });

      context('when meter function throws error', () => {
        beforeEach(() => {
          planRetrieverStub.getPlan.returns(Promise.resolve(planStub));
          meterFnStub.throws();
        });

        it('meterUsage throws metricComputation error', async() => {
          await verifyThrownError(meter.meterUsage, (err) => {
            expect(err.metricComputation).to.equal(true);
          });
        });
      });
    });


  });

});
