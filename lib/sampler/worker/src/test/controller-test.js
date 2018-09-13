'use strict';

const moment = require('abacus-moment');
const { May } = moment;
const { Controller, Processor } = require('../lib/controller');

const assertFails = async (func) => {
  let funcErr = undefined;
  try {
    await func();
  } catch (e) {
    funcErr = e;
  }
  expect(funcErr).not.to.equal(undefined);
  return funcErr;
};

describe('controller', () => {
  let spanDAO;

  beforeEach(() => {
    spanDAO = {
      findIncompleteSpans: sinon.stub(),
      updateSpanPlannedInterval: sinon.stub(),
      updateSpanProcessedInterval: sinon.stub(),
      findCompleteSpans: sinon.stub(),
      deleteSpansByIDs: sinon.stub()
    };
  });

  describe('Controller', () => {
    const cleanupAge = 1000 * 60 * 60; // 1 hour
    const cleanupBatchOffset = 5;
    const cleanupBatchSize = 10;
    const samplingDimension = 'day';
    const processingBatchOffset = 15;
    const processingBatchSize = 20;

    let clock;
    let processor;
    let controller;

    beforeEach(() => {
      clock = sinon.useFakeTimers(moment.utcTimestamp(2018, May, 13, 12, 0, 0, 0));
      processor = {
        processSpan: sinon.stub()
      };
      controller = new Controller({
        spanDAO: spanDAO,
        processor: processor,
        samplingDimension: samplingDimension,
        processingBatchOffset: processingBatchOffset,
        processingBatchSize: processingBatchSize,
        cleanupBatchOffset: cleanupBatchOffset,
        cleanupBatchSize: cleanupBatchSize,
        cleanupAge: cleanupAge
      });
    });

    afterEach(() => {
      clock.restore();
    });

    describe('#processSpans', () => {
      const plannedSpan = {
        _id: 'first',
        processing: {
          planned_interval: {}
        }
      };
      const unplannedSpan = {
        _id: 'second',
        processing: {
          planned_interval: null
        }
      };

      beforeEach(() => {
        spanDAO.findIncompleteSpans.callsFake(async () => {
          return [plannedSpan, unplannedSpan];
        });
      });

      it('forwards processing to processor', async () => {
        await controller.processSpans();

        assert.calledOnce(spanDAO.findIncompleteSpans);
        assert.calledWithExactly(
          spanDAO.findIncompleteSpans,
          moment.utcTimestamp(2018, May, 12, 12, 0, 0, 0),
          processingBatchOffset,
          processingBatchSize
        );

        assert.calledTwice(processor.processSpan);
        assert.calledWithExactly(processor.processSpan, plannedSpan);
        assert.calledWithExactly(processor.processSpan, unplannedSpan);
      });

      context('when findIncompleteSpans fails', () => {
        let findErr;

        beforeEach(() => {
          findErr = new Error('find stubbed to fail');
          spanDAO.findIncompleteSpans.callsFake(async () => {
            throw findErr;
          });
        });

        it('rethrows the error', async () => {
          const processErr = await assertFails(async () => {
            await controller.processSpans();
          });
          expect(processErr).to.equal(findErr);
        });
      });
    });

    describe('#cleanupSpans', () => {
      const firstSpanID = 'first';
      const secondSpanID = 'second';

      beforeEach(() => {
        spanDAO.findCompleteSpans.callsFake(async () => {
          return [
            { _id: firstSpanID },
            { _id: secondSpanID }
          ];
        });
      });

      it('it deletes all old and complete jobs', async () => {
        await controller.cleanupSpans();

        assert.calledOnce(spanDAO.findCompleteSpans);
        assert.calledWithExactly(
          spanDAO.findCompleteSpans,
          moment.utcTimestamp(2018, May, 13, 11, 0, 0, 0),
          cleanupBatchOffset,
          cleanupBatchSize
        );

        assert.calledOnce(spanDAO.deleteSpansByIDs);
        assert.calledWithExactly(
          spanDAO.deleteSpansByIDs,
          [firstSpanID, secondSpanID]
        );
      });

      context('when findCompleteSpans fails', () => {
        let findErr;

        beforeEach(() => {
          findErr = new Error('find stubbed to fail');
          spanDAO.findCompleteSpans.callsFake(async () => {
            throw findErr;
          });
        });

        it('it rethrows the error', async () => {
          const cleanupErr = await assertFails(async () => {
            await controller.cleanupSpans();
          });
          expect(cleanupErr).to.equal(findErr);
        });
      });

      context('when deleteSpansByIDs fails', () => {
        let deleteErr;

        beforeEach(() => {
          deleteErr = new Error('delete stubbed to fail');
          spanDAO.deleteSpansByIDs.callsFake(async () => {
            throw deleteErr;
          });
        });

        it('it rethrows the error', async () => {
          const cleanupErr = await assertFails(async () => {
            await controller.cleanupSpans();
          });
          expect(cleanupErr).to.equal(deleteErr);
        });
      });
    });
  });

  describe('Processor', () => {
    let abacusClient;
    let sampler;
    let processor;

    beforeEach(() => {
      spanDAO.updateSpanProcessedInterval.returns(false);
      spanDAO.updateSpanPlannedInterval.returns(false);
      abacusClient = {
        postUsage: sinon.stub()
      };
      sampler = {
        calculateNextIntervalEnd: sinon.stub()
      };
      processor = new Processor({
        spanDAO: spanDAO,
        abacusClient: abacusClient,
        sampler: sampler
      });
    });

    describe('#processSpan', () => {
      context('when span is planned', () => {
        const plannedSpan = {
          _id: '0dc57bd8-6831-4a0b-ab22-67442fe528b5',
          target: {
            organization_id: 'b0930730-ea8e-4a2c-8b5d-cf6977764c94',
            space_id: 'b0930730-ea8e-4a2c-8b5d-cf6977764c94',
            consumer_id: '12c02601-7ce6-4660-a85c-53a505b484d2',
            resource_id: 'mongodb',
            plan_id: 'dedicated',
            resource_instance_id: '74742216-45bd-44ff-806b-fbc7e8d32acf'
          },
          measured_usage: [
            {
              measure: 'api_calls',
              quantity: 128
            }
          ],
          end: moment.utcTimestamp(2018, May, 10, 16, 0, 0, 0),
          processing: {
            planned_interval: {
              start: moment.utcTimestamp(2018, May, 10, 8, 0, 0, 0),
              end: moment.utcTimestamp(2018, May, 10, 14, 0, 0, 0),
              usage_guid: '5478ecfd-25ef-4af4-9938-2a82bece67b2'
            },
            version: 14
          }
        };

        it('executes the planned interval of the span', async () => {
          await processor.processSpan(plannedSpan);

          assert.calledOnce(abacusClient.postUsage);
          assert.calledWithExactly(abacusClient.postUsage, {
            start: moment.utcTimestamp(2018, May, 10, 11, 0, 0, 0),
            end: moment.utcTimestamp(2018, May, 10, 11, 0, 0, 0),
            organization_id: plannedSpan.target.organization_id,
            space_id: plannedSpan.target.space_id,
            consumer_id: plannedSpan.target.consumer_id,
            resource_id: plannedSpan.target.resource_id,
            plan_id: plannedSpan.target.plan_id,
            resource_instance_id: plannedSpan.target.resource_instance_id,
            measured_usage: [
              plannedSpan.measured_usage[0],
              {
                measure: 'duration',
                quantity: 6 * 60 * 60 * 1000 // 6 hours in millis
              }
            ]
          });

          assert.calledOnce(spanDAO.updateSpanProcessedInterval);
          assert.calledWithExactly(
            spanDAO.updateSpanProcessedInterval,
            plannedSpan._id,
            plannedSpan.processing.planned_interval,
            false,
            plannedSpan.processing.version
          );
        });

        context('when planned interval end matches span end', () => {
          beforeEach(() => {
            plannedSpan.processing.planned_interval.end = plannedSpan.end;
          });

          it('should mark the span as complete', async () => {
            await processor.processSpan(plannedSpan);

            assert.calledOnce(spanDAO.updateSpanProcessedInterval);
            assert.calledWithExactly(
              spanDAO.updateSpanProcessedInterval,
              plannedSpan._id,
              plannedSpan.processing.planned_interval,
              true,
              plannedSpan.processing.version
            );
          });
        });

        context('when updateSpanProcessedInterval fails', () => {
          let updateErr;

          beforeEach(() => {
            updateErr = new Error('update stubbed to fail');
            spanDAO.updateSpanProcessedInterval.callsFake(async () => {
              throw updateErr;
            });
          });

          it('rethrows the error', async () => {
            const processErr = await assertFails(async () => {
              await processor.processSpan(plannedSpan);
            });
            expect(processErr).to.equal(updateErr);
          });
        });
      });

      context('when span is unplanned', () => {
        const unplannedSpan = {
          _id: '0dc57bd8-6831-4a0b-ab22-67442fe528b5',
          end: moment.utcTimestamp(2018, May, 11, 16, 0, 0, 0),
          processing: {
            last_interval: {
              end: moment.utcTimestamp(2018, May, 10, 8, 0, 0, 0)
            },
            planned_interval: null,
            version: 13
          }
        };
        const samplerEnd = moment.utcTimestamp(2018, May, 11, 0, 0, 0, 0);

        beforeEach(() => {
          sampler.calculateNextIntervalEnd.returns(samplerEnd);
        });

        it('plans the span', async () => {
          await processor.processSpan(unplannedSpan);

          assert.calledOnce(sampler.calculateNextIntervalEnd);
          assert.calledWithExactly(
            sampler.calculateNextIntervalEnd,
            unplannedSpan.processing.last_interval.end,
            unplannedSpan.end
          );

          assert.calledOnce(spanDAO.updateSpanPlannedInterval);
          assert.calledWithExactly(
            spanDAO.updateSpanPlannedInterval,
            unplannedSpan._id,
            {
              start: unplannedSpan.processing.last_interval.end,
              end: samplerEnd,
              usage_guid: sinon.match.string
            },
            unplannedSpan.processing.version
          );
        });

        context('when updateSpanPlannedInterval fails', () => {
          let updateErr;

          beforeEach(() => {
            updateErr = new Error('update stubbed to fail');
            spanDAO.updateSpanPlannedInterval.callsFake(async () => {
              throw updateErr;
            });
          });

          it('rethrows the error', async () => {
            const processErr = await assertFails(async () => {
              await processor.processSpan(unplannedSpan);
            });
            expect(processErr).to.equal(updateErr);
          });
        });
      });
    });
  });
});
