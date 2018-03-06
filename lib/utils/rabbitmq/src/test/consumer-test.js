'use strict';

const Consumer = require('../lib/consumer');

const queueName = 'queueName';
const prefetchLimit = 2;
const config = {
  queueName,
  prefetchLimit
};

describe('Consumer', () => {
  const sandbox = sinon.sandbox.create();
  let fakeChannel;
  let fakeConnectionManager;
  let fakeHandler;
  let consumer;

  beforeEach(() => {
    fakeHandler = {
      handle: sandbox.stub()
    };

    fakeChannel = {
      close: sandbox.stub()
    };

    fakeConnectionManager = {
      connect: sandbox.stub().returns(fakeChannel)
    };

    consumer = new Consumer(fakeConnectionManager, queueName, prefetchLimit);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('process queue', () => {
    beforeEach(async() => {
      await consumer.process(fakeHandler);
    });

    const assertCorrectSetupFn = (setupFn) => {
      const amqpChannel = {
        assertQueue: sandbox.stub(),
        prefetch: sandbox.stub(),
        consume: sandbox.stub(),
        ack: sandbox.stub(),
        nack: sandbox.stub()
      };
      setupFn(amqpChannel);
      assert.calledWith(channelStub.assertQueue, queueName);
      assert.calledWith(channelStub.prefetch, prefetchLimit);
      assert.calledWith(channelStub.consume, queueName);
    };

    it('creates channel via connection manager', () => {
      assert.calledOnce(fakeConnectionManager.connect);
      const setupFnArg = fakeConnectionManager.connect.firstCall.args[0];
      assertCorrectSetupFn(setupFnArg);
    });

    context('when connects', () => {
      context('when message is handled successfully', () => {
        const message = 'message';

        beforeEach(async() => {
          const consumeCallback = channelStub.consume.args[0][1];
          msgHandlerStub.handle.returns(Promise.resolve(Consumer.MessageHandleStatus.SUCCESS));
          await consumeCallback(message);
        });

        it('message is acked', () => {
          assert.calledWith(msgHandlerStub.handle, message);
          assert.calledWith(channelStub.ack, message);
        });

      });

      context('when message handling should be retried', () => {
        const message = 'message';

        beforeEach(async() => {
          const consumeCallback = channelStub.consume.args[0][1];
          msgHandlerStub.handle.returns(Promise.resolve(Consumer.MessageHandleStatus.RETRY));
          await consumeCallback(message);
        });

        it('message is nacked', () => {
          assert.notCalled(channelStub.ack);
          assert.calledWith(channelStub.nack, message);
        });

      });

      context('when message is duplicate', () => {
        const message = 'message';

        beforeEach(async() => {
          const consumeCallback = channelStub.consume.args[0][1];
          msgHandlerStub.handle.returns(Promise.resolve(Consumer.MessageHandleStatus.CONFLICT));
          await consumeCallback(message);
        });

        it('message is acked', () => {
          assert.calledWith(channelStub.ack, message);
          assert.notCalled(channelStub.nack);
        });

      });

      context('when message cannot be procesed', () => {
        const message = 'message';

        beforeEach(async() => {
          const consumeCallback = channelStub.consume.args[0][1];
          msgHandlerStub.handle.returns(Promise.resolve(Consumer.MessageHandleStatus.CANNOT_PROCESS));
          await consumeCallback(message);
        });

        it('message is acked', () => {
          assert.calledWith(channelStub.ack, message);
        });

        it('error is written into error db', () => {
          // IMPLEMENT ME
        });

      });
    });
  });

  describe('close Consumer', () => {
    let consumer;
    let closeStub;

    beforeEach(() => {
      closeStub = sandbox.stub();
      const channelStub = {
        close: closeStub
      };

      connectionManagerStub.connect.returns(channelStub);
      consumer = new Consumer(config, connectionManagerStub, msgHandlerStub);
    });

    it('calls channel close', async() => {
      await consumer.process();
      await consumer.close();

      assert.calledOnce(closeStub);
    });
    // TODO reimplement test with chai-as-promised
    it('when consumer is not connected, throws', (done) => {
      consumer.close()
        .then(() => done(new Error('Error to be thrown is expected')))
        .catch((err) => done());
    });
  });
});

