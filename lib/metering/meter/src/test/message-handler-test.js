'use strict';

const MessageHandleStatus = require('abacus-rabbitmq').Consumer.MessageHandleStatus;

describe('Message handler', () => {
  const MessageHandler = require('../lib/message-handler').MessageHandler;
  let sandbox;
  let normalizerStub;
  let meterStub;
  let accumulatorClientStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    normalizerStub = {
      normalizeUsage: sandbox.stub()
    };
    meterStub = {
      meterUsage: sandbox.stub()
    };
    accumulatorClientStub = {
      sendUsage: sandbox.stub()
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('create MessageHandler', () => {
    const invalidParameter = {};

    context('with valid parameters', () => {
      it('should set provided properties', () => {
        expect(() => new MessageHandler(normalizerStub, meterStub, accumulatorClientStub)).not.to.throw();
      });
    });

    context('with invalid parameters', () => {

      it('throws when normalizer does not provide expected methods', () => {
        expect(() => new MessageHandler(invalidParameter, meterStub)).to.throw('Normalizer is not valid');
      });

      it('throws when meter does not provide expected methods', () => {
        expect(() => new MessageHandler(normalizerStub, invalidParameter))
          .to.throw('Meter is not valid');
      });

      it('throws when accumulatorClient does not provide expected methods', () => {
        expect(() => new MessageHandler(normalizerStub, meterStub, invalidParameter))
          .to.throw('AccumulatorClient is not valid');
      });
    });
  });

  describe('handle message ', () => {
    const msg = 'msg';

    let handler;
    let handleResult;

    beforeEach(async() => {
      handler = new MessageHandler(normalizerStub, meterStub, accumulatorClientStub);
    });

    context('when no error is thrown', () => {
      const normalizedDoc = 'normalized-doc';
      const meterDoc = 'metered-doc';

      beforeEach(async() => {
        normalizerStub.normalizeUsage.returns(Promise.resolve(normalizedDoc));
        meterStub.meterUsage.returns(Promise.resolve(meterDoc));
        accumulatorClientStub.sendUsage.returns(Promise.resolve());
        handleResult = await handler.handle(msg);
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
        assert.calledOnce(accumulatorClientStub.sendUsage);
        assert.calledWith(accumulatorClientStub.sendUsage, meterDoc);
      });

      it('returns SUCCESS status', () => {
        expect(handleResult).to.equal(MessageHandleStatus.SUCCESS);
      });

    });

    context('when error occurs', () => {

      context('when normalize throws error', () => {
        beforeEach(async() => {
          normalizerStub.normalizeUsage.returns(Promise.reject(new Error()));
          handleResult = await handler.handle(msg);
        });

        it('returns RETRY status', () => {
          expect(handleResult).to.equal(MessageHandleStatus.RETRY);
        });
      });

      context('when accumulatorClient throws error', () => {
        beforeEach(async() => {
          accumulatorClientStub.sendUsage.returns(Promise.reject(new Error()));
          handleResult = await handler.handle(msg);
        });

        it('returns RETRY status', () => {
          expect(handleResult).to.equal(MessageHandleStatus.RETRY);
        });

      });

      context('when meter throws error', () => {
        context('metric computation error', () => {

          beforeEach(async() => {
            meterStub.meterUsage.returns(Promise.reject({ metricComputation: true }));
            handleResult = await handler.handle(msg);
          });

          it('returns CANNOT_PROCESS status', () => {
            expect(handleResult).to.equal(MessageHandleStatus.CANNOT_PROCESS);
          });

        });

        context('non metric computation error', () => {

          beforeEach(async() => {
            meterStub.meterUsage.throws();
            handleResult = await handler.handle(msg);
          });

          it('returns RETRY status', () => {
            expect(handleResult).to.equal(MessageHandleStatus.RETRY);
          });

        });
      });
    });

  });
});
