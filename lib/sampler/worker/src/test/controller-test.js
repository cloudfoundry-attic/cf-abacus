'use strict';

const moment = require('abacus-moment');
const { May } = moment;
const { Controller } = require('../lib/controller');

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

describe('Controller', () => {
  const cleanupAge = 1000 * 60 * 60; // 1 hour
  const cleanupBatchOffset = 5;
  const cleanupBatchSize = 10;

  let clock;
  let spanDAO;
  let controller;

  beforeEach(() => {
    clock = sinon.useFakeTimers(moment.utcTimestamp(2018, May, 13, 12, 0, 0, 0));
    spanDAO = {
      findCompleteSpans: sinon.stub(),
      deleteSpansByIDs: sinon.stub()
    };
    controller = new Controller({
      spanDAO: spanDAO,
      cleanupBatchOffset: cleanupBatchOffset,
      cleanupBatchSize: cleanupBatchSize,
      cleanupAge: cleanupAge
    });
  });

  afterEach(() => {
    clock.restore();
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
