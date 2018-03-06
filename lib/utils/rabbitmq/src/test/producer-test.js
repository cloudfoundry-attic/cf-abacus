'use strict';

const Producer = require('../lib/producer');

describe('Producer', () => {
  const sandbox = sinon.sandbox.create();
  const queueName = 'queueName';
  const message = 'message';

  let fakeChannel;
  let fakeConnectionManager;
  let producer;

  beforeEach(() => {
    fakeChannel = {
      sendToQueue: sandbox.stub().returns(Promise.resolve()),
      close: sandbox.stub().returns(Promise.resolve()),
      on: sandbox.stub()
    };

    fakeConnectionManager = {
      connect: sandbox.stub().returns(fakeChannel)
    };

    producer = new Producer(fakeConnectionManager, queueName);
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when connected', () => {
    beforeEach(async() => {
      await producer.connect();
    });

    const assertCorrectSetupFn = (setupFn) => {
      const amqpChannel = {
        assertQueue: sandbox.stub()
      };
      setupFn(amqpChannel);
      assert.calledOnce(amqpChannel.assertQueue);
      assert.calledWith(amqpChannel.assertQueue, queueName, { durable: true });
    };

    it('calls connect on manager', () => {
      assert.calledOnce(fakeConnectionManager.connect);
      const setupFnArg = fakeConnectionManager.connect.firstCall.args[0];
      assertCorrectSetupFn(setupFnArg);
    });

    context('when message is sent', () => {
      beforeEach(async() => {
        await producer.send(message);
      });

      it('sends persistent message', () => {
        assert.calledOnce(fakeChannel.sendToQueue);
        assert.calledWith(fakeChannel.sendToQueue, queueName, message, { persistent: true });
      });
    });

    context('when closed', () => {
      beforeEach(async() => {
        await producer.close();
      });

      it('closes the channel', () => {
        assert.calledOnce(fakeChannel.close);
      });
    });
  });

  context('when not connected', () => {
    context('when message is sent', () => {
      it('throws an error', async() => {
        let errMessage;
        try {
          await producer.send(message);
        } catch(err) {
          errMessage = err.message;
        }
        expect(errMessage).to.equal('Producer is not connected! Use connect method first!');
      });
    });

    context('when closed', () => {
      beforeEach(async() => {
        await producer.close();
      });

      it('nothing happens', () => {
        assert.notCalled(fakeChannel.close);
      });
    });
  });
});
