'use strict';

const { extend } = require('underscore');
const MessageHandler = require('../lib/message-handler').MessageHandler;

describe('Message handler', () => {

  let sandbox;
  let meterStub;
  let normalizerStub;
  let outputDbClientStub;
  let accumulatorClientStub;
  let errorDbClientStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();

    outputDbClientStub = {
      put: sandbox.stub()
    };
    errorDbClientStub = {
      put: sandbox.stub()
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
    const usageDoc = { usage: 'doc' };

    let handler;

    beforeEach(async() => {
      handler = new MessageHandler(normalizerStub, meterStub, accumulatorClientStub,
        outputDbClientStub, errorDbClientStub);
    });

    context('when processing successfully', () => {
      const meterDoc = 'metered-doc';
      const normalizedDoc = 'normalized-doc';

      beforeEach(async() => {
        meterStub.meterUsage.resolves(meterDoc);
        accumulatorClientStub.postUsage.resolves(meterDoc);
        normalizerStub.normalizeUsage.resolves(normalizedDoc);
        await handler.handle(usageDoc);
      });

      it('normalizes usage', async() => {
        assert.calledOnce(normalizerStub.normalizeUsage);
        assert.calledWith(normalizerStub.normalizeUsage, usageDoc);
      });

      it('meters usage', async() => {
        assert.calledOnce(meterStub.meterUsage);
        assert.calledWith(meterStub.meterUsage, normalizedDoc);
      });

      it('sends usage', () => {
        assert.calledOnce(accumulatorClientStub.postUsage);
        assert.calledWith(accumulatorClientStub.postUsage, meterDoc);
      });

      it('stores in output db', () => {
        assert.calledOnce(outputDbClientStub.put);
        assert.calledWith(outputDbClientStub.put, meterDoc);
      });
    });

    context('when processing unsuccessfully rethrows', () => {
      let expectedError;

      context('when normalizer throws', () => {
        expectedError = new Error('Normalizer error');
        beforeEach(() => {
          normalizerStub.normalizeUsage.rejects(expectedError);
        });

        it('should rethrow the error', async() => {
          await assertPromise.isRejected(handler.handle(usageDoc), expectedError);
        });
      });

      context('when meter throws', () => {
        beforeEach(() => {
          normalizerStub.normalizeUsage.resolves(sandbox.any);
        });

        context('business error', () => {
          beforeEach(() => {
            expectedError = new Error('Meter error');
            extend(expectedError, { isPlanBusinessError: true });
            meterStub.meterUsage.rejects(expectedError);
          });

          context('and successfully stores in error db', () => {
            beforeEach(async() => {
              errorDbClientStub.put.resolves();
              await handler.handle(usageDoc);
            });

            it('error db is called with correct parameters', () => {
              assert.calledOnce(errorDbClientStub.put);
              assert.calledWith(errorDbClientStub.put, extend({}, usageDoc, { error: expectedError }));
            });
          });

          context('and stores in error db throws an error', () => {
            const expectedErrMsg = 'Storing in error db fails';
            beforeEach(() => {
              expectedError = new Error(expectedErrMsg);
              errorDbClientStub.put.rejects(expectedError);
            });

            it('error db is called with correct parameters', async() => {
              await assertPromise.isRejected(handler.handle(usageDoc), expectedErrMsg);
            });
          });

        });
        context('other error', () => {
          beforeEach(() => {
            expectedError = new Error('Meter error');
            meterStub.meterUsage.rejects(expectedError);
          });

          it('should rethrow the error', async() => {
            await assertPromise.isRejected(handler.handle(usageDoc), expectedError);
          });
        });
      });

      context('when accumulator throws', () => {
        beforeEach(() => {
          normalizerStub.normalizeUsage.resolves(sandbox.any);
          meterStub.meterUsage.resolves(sandbox.any);
        });

        context('non-business error', () => {
          beforeEach(() => {
            expectedError = new Error('Accumulator error');
            accumulatorClientStub.postUsage.rejects(expectedError);
          });

          it('should rethrow the error', async() => {
            await assertPromise.isRejected(handler.handle(usageDoc), expectedError);
          });
        });

        context('business error', () => {
          beforeEach(() => {
            expectedError = new Error('Accumulator error');
            expectedError.isPlanBusinessError = true;
            accumulatorClientStub.postUsage.rejects(expectedError);
          });

          context('when error db succeeds', () => {
            beforeEach(async() => {
              await handler.handle(usageDoc);
            });

            it('stores document and error in error db', () => {
              assert.calledOnce(errorDbClientStub.put);
              assert.calledWith(errorDbClientStub.put, extend({}, usageDoc, { error: expectedError }));
            });
          });

          context('when error db store failed', () => {
            beforeEach(() => {
              errorDbClientStub.put.rejects(expectedError);
            });

            it('rethrows the error', async() => {
              await assertPromise.isRejected(handler.handle(usageDoc), expectedError);
            });
          });
        });
      });

      context('when store in output db throws', () => {
        beforeEach(() => {
          expectedError = new Error('Output db error');
          normalizerStub.normalizeUsage.resolves(sandbox.any);
          meterStub.meterUsage.resolves(sandbox.any);
          accumulatorClientStub.postUsage.resolves(sandbox.any);
          outputDbClientStub.put.rejects(expectedError);
        });

        it('should rethrow the error', async() => {
          await assertPromise.isRejected(handler.handle(usageDoc), expectedError);
        });
      });
    });
  });
});
