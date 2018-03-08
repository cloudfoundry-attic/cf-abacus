'use strict';

describe('Message handler', () => {
  const MessageHandler = require('../lib/message-handler').MessageHandler;

  let sandbox;
  let meterStub;
  let normalizerStub;
  let errorDbClientStub;
  let accumulatorClientStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();

    errorDbClientStub = {
      store: sandbox.stub()
    };
    accumulatorClientStub = {
      postUsage: sandbox.stub()
    };
    meterStub = {
      meterUsage: sandbox.stub()
    };
    normalizerStub = {
      normalizeUsage: sandbox.stub()
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('handle message ', () => {
    const msg = 'msg';

    let handler;

    beforeEach(async() => {
      handler = new MessageHandler(normalizerStub, meterStub, accumulatorClientStub, errorDbClientStub);
    });

    context('when processing successfully', () => {
      const meterDoc = 'metered-doc';
      const normalizedDoc = 'normalized-doc';

      beforeEach(async() => {
        meterStub.meterUsage.resolves(meterDoc);
        accumulatorClientStub.postUsage.resolves();
        normalizerStub.normalizeUsage.resolves(normalizedDoc);
        await handler.handle(msg);
      });

      it('calls normalize', async() => {
        assert.calledOnce(normalizerStub.normalizeUsage);
        assert.calledWith(normalizerStub.normalizeUsage, msg);
      });

      it('calls meter usage', async() => {
        assert.calledOnce(meterStub.meterUsage);
        assert.calledWith(meterStub.meterUsage, normalizedDoc);
      });

      it('sends to accumulator', () => {
        assert.calledOnce(accumulatorClientStub.postUsage);
        assert.calledWith(accumulatorClientStub.postUsage, meterDoc);
      });
    });

    context('when processing unsuccessfully', () => {
      context('with business error', () => {
        context('with plan error', () => {
          beforeEach(() => {
            meterStub.meterUsage.rejects({ isPlanBusinessError: true });
          });

          context('when successfully storing error in error db', () => {
            beforeEach(() => {
              errorDbClientStub.store.resolves();
            });

            it('should not throw', async() => {
              await assertPromise.isFulfilled(handler.handle(msg));
            });
          });

          context('when unsuccessfully storing error in error db', () => {
            const expectedErrorMessage = 'Error storing';

            beforeEach(() => {
              errorDbClientStub.store.rejects(new Error(expectedErrorMessage));
            });

            it('should throw', async() => {
              await assertPromise.isRejected(handler.handle(msg), expectedErrorMessage);
            });
          });
        });

        context('with duplicate document error', () => {
          beforeEach(async() => {
            accumulatorClientStub.postUsage.rejects({ isDuplicateMessage: true });
          });

          it('should not throw', async() => {
            await assertPromise.isFulfilled(handler.handle(msg));
          });
        });
      });

      context('with non business error', () => {
        beforeEach(async() => {
          meterStub.meterUsage.rejects();
        });

        it('should throw', async() => {
          await assertPromise.isRejected(handler.handle(msg));
        });
      });
    });
  });
});
