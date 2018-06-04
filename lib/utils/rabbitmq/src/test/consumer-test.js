'use strict';

const Consumer = require('../lib/consumer');

const queueName = 'queueName';
const prefetchLimit = 2;

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
    let amqpChannel;

    beforeEach(async() => {
      amqpChannel = {
        assertQueue: sandbox.stub(),
        prefetch: sandbox.stub(),
        consume: sandbox.stub(),
        ack: sandbox.stub(),
        nack: sandbox.stub()
      };

      await consumer.process(fakeHandler);
    });

    const assertCorrectSetupFn = (setupFn) => {
      setupFn(amqpChannel);
      assert.calledWith(amqpChannel.assertQueue, queueName);
      assert.calledWith(amqpChannel.prefetch, prefetchLimit);
      assert.calledWith(amqpChannel.consume, queueName);
    };

    it('creates channel via connection manager', () => {
      assert.calledOnce(fakeConnectionManager.connect);
      const setupFnArg = fakeConnectionManager.connect.firstCall.args[0];
      assertCorrectSetupFn(setupFnArg);
    });

    context('when connects', () => {
      beforeEach(() => {
        const setupFnArg = fakeConnectionManager.connect.firstCall.args[0];
        assertCorrectSetupFn(setupFnArg);
      });
      context('when message is handled successfully', () => {
        const message = 'message';

        beforeEach(async() => {
          const consumeCallback = amqpChannel.consume.args[0][1];
          fakeHandler.handle.returns(Promise.resolve());

          await consumeCallback(message);
        });

        it('message is acked', () => {
          assert.calledWith(fakeHandler.handle, message);
          assert.calledWith(amqpChannel.ack, message);
          assert.notCalled(amqpChannel.nack);
        });

      });

      context('when message handling throws', () => {
        const message = 'message';

        beforeEach(async() => {
          const consumeCallback = amqpChannel.consume.args[0][1];
          fakeHandler.handle.returns(Promise.reject(new Error()));
          await consumeCallback(message);
        });

        it('message is nacked', () => {
          assert.notCalled(amqpChannel.ack);
          assert.calledWith(amqpChannel.nack, message);
        });

      });

    });
  });

  describe('close Consumer', () => {
    let consumer;

    beforeEach(() => {
      fakeConnectionManager.connect.returns(fakeChannel);
      consumer = new Consumer(fakeConnectionManager, queueName, prefetchLimit);
    });

    it('calls channel close', async() => {
      await consumer.process();
      await consumer.close();

      assert.calledOnce(fakeChannel.close);
    });
    // TODO reimplement test with chai-as-promised
    it('when consumer is not connected, throws', (done) => {
      consumer.close()
        .then(() => done(new Error('Error to be thrown is expected')))
        .catch((err) => done());
    });
  });
});

