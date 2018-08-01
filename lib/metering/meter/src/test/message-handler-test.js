'use strict';

const { extend, pick } = require('underscore');
const { createMessageHandler } = require('../lib/message-handler');

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
    const message = {
      metadata: { retryCount: 0 },
      usageDoc: { usage: 'doc' }
    };
    const allowedRetries = 2;

    let handler;

    beforeEach(async() => {
      handler = createMessageHandler(normalizerStub, meterStub, accumulatorClientStub,
        { output: outputDbClientStub, error: errorDbClientStub }, allowedRetries);
    });

    context('when processing successfully', () => {
      const meterDoc = 'metered-doc';
      const normalizedDoc = 'normalized-doc';

      beforeEach(async() => {
        meterStub.meterUsage.resolves(meterDoc);
        accumulatorClientStub.postUsage.resolves(meterDoc);
        normalizerStub.normalizeUsage.resolves(normalizedDoc);
        await handler.handle(message);
      });

      it('normalizes usage', async() => {
        assert.calledOnce(normalizerStub.normalizeUsage);
        assert.calledWith(normalizerStub.normalizeUsage, message.usageDoc);
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
          await assertPromise.isRejected(handler.handle(message), expectedError);
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
              await handler.handle(message);
            });

            it('error db is called with correct parameters', () => {
              assert.calledOnce(errorDbClientStub.put);
              assert.calledWith(errorDbClientStub.put, extend({}, message.usageDoc,
                pick(message, 'metadata'), { error: expectedError }));
            });
          });

          context('and stores in error db throws an error', () => {
            const expectedErrMsg = 'Storing in error db fails';
            beforeEach(() => {
              expectedError = new Error(expectedErrMsg);
              errorDbClientStub.put.rejects(expectedError);
            });

            it('error db is called with correct parameters', async() => {
              await assertPromise.isRejected(handler.handle(message), expectedErrMsg);
            });
          });

        });
        context('other error', () => {
          beforeEach(() => {
            expectedError = new Error('Meter error');
            meterStub.meterUsage.rejects(expectedError);
          });

          it('should rethrow the error', async() => {
            await assertPromise.isRejected(handler.handle(message), expectedError);
          });
        });
      });

      context('when accumulator throws', () => {

        const buildAccumulatorError = (prop) => {
          const error = new Error('Accumulator error');
          error[prop] = true;
          return error;
        };

        const contextBusinessError = (msg, prop) => context(msg, () => {
          beforeEach(() => {
            expectedError = buildAccumulatorError(prop);
            accumulatorClientStub.postUsage.rejects(expectedError);
          });

          context('when error db succeeds', () => {
            beforeEach(async() => {
              await handler.handle(message);
            });

            it('stores document and error in error db', () => {
              assert.calledOnce(errorDbClientStub.put);
              assert.calledWith(errorDbClientStub.put, extend({}, message.usageDoc,
                pick(message, 'metadata'), { error: expectedError }));
            });
          });

          context('when error db store failed', () => {
            beforeEach(() => {
              errorDbClientStub.put.rejects(expectedError);
            });

            it('rethrows the error', async() => {
              try{
                await handler.handle(message);
              } catch(e) {
                expect(e[prop]).to.be.equal(true);
              }
            });
          });
        });

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
            await assertPromise.isRejected(handler.handle(message), expectedError);
          });
        });

        contextBusinessError('out of slack error', 'isOutOfSlackError');
        contextBusinessError('plan business error', 'isPlanBusinessError');
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
          await assertPromise.isRejected(handler.handle(message), expectedError);
        });
      });

      context(`when message is retried more than ${allowedRetries} allowed times`, () => {

        beforeEach(async() => {
          message.metadata.retryCount = allowedRetries + 1;
          expectedError = new Error('Normalizer error');
          normalizerStub.normalizeUsage.rejects(expectedError);
          await handler.handle(message);
        });
        it('should store in error db', () => {
          assert.calledOnce(errorDbClientStub.put);
          assert.calledWith(errorDbClientStub.put, extend({}, message.usageDoc,
            pick(message, 'metadata'), { error: expectedError }));
        });
      });
    });
  });
});
