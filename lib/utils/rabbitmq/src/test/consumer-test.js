'use strict';

const Consumer = require('../lib/consumer');

const queueName = 'queueName';
const prefetchLimit = 2;
const config = {
  queueName,
  prefetchLimit
};

describe('Consumer', () => {
  let sandbox;

  let msgHandlerStub;
  let connectionManagerStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    msgHandlerStub = {
      handle: sandbox.stub()
    };
    connectionManagerStub = {
      connect: sandbox.stub().returns('channel')
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('create Consumer object', () => {
    context('when passing invalid parameters', () => {

      it('throws without queue name', () => {
        expect(() => new Consumer({ prefetchLimit: 1 }, connectionManagerStub, msgHandlerStub))
          .to.throw('Invalid queue configuration');
      });

      it('throws without queue prefetch limit', () => {
        expect(() => new Consumer({ queueName }, connectionManagerStub, msgHandlerStub))
          .to.throw('Invalid queue configuration');
      });

      it('throws without message handler', () => {
        expect(() => new Consumer(config, connectionManagerStub)).to.throw();
      });

      it('throws with handler that has no handle function', () => {
        expect(() => new Consumer(config, connectionManagerStub, {})).to.throw();
      });

      it('throws with manager that has no connect function', () => {
        expect(() => new Consumer(config, {}, msgHandlerStub)).to.throw('Invalid connection');
      });

    });

    context('when passing valid parameters', () => {

      it('sets provided properties', () => {
        expect(() => new Consumer(config, connectionManagerStub, msgHandlerStub)).not.to.throw();
      });
    });

  });


  describe('process queue', () => {
    let consumer;

    beforeEach(() => {
      consumer = new Consumer(config, connectionManagerStub, msgHandlerStub);
      consumer.process();
    });

    it('connection manger connected', () => {
      assert.calledOnce(connectionManagerStub.connect);
    });

    context('when connects', () => {
      let channelStub;

      beforeEach(() => {
        channelStub = {
          assertQueue: sandbox.stub(),
          prefetch: sandbox.stub(),
          consume: sandbox.stub(),
          ack: sandbox.stub(),
          nack: sandbox.stub()
        };

        const connectCallback = connectionManagerStub.connect.args[0][0];
        connectCallback(channelStub);
      });

      it('channel is configured', () => {
        assert.calledWith(channelStub.assertQueue, queueName);
        assert.calledWith(channelStub.prefetch, prefetchLimit);
        assert.calledWith(channelStub.consume, queueName);
      });


      context('when message is consumed successfully', () => {
        const message = 'message';

        beforeEach(() => {
          const consumeCallback = channelStub.consume.args[0][1];
          consumeCallback(message);
        });

        it('message is acked', () => {
          assert.calledWith(msgHandlerStub.handle, message);
          assert.calledWith(channelStub.ack, message);
        });

      });

      context('when message is not consumed successfully', () => {
        const message = 'message';

        beforeEach(() => {
          const consumeCallback = channelStub.consume.args[0][1];
          msgHandlerStub.handle.throws();
          consumeCallback(message);
        });

        it('message is nacked', () => {
          assert.calledWith(msgHandlerStub.handle, message);
          assert.notCalled(channelStub.ack);
          assert.calledWith(channelStub.nack, message);
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
      consumer.process();
      await consumer.close();

      assert.calledOnce(closeStub);
    });

    it('when consumer is not connected, throws', (done) => {
      consumer.close()
        .then(() => done(new Error('Error to be thrown is expected')))
        .catch((err) => done());
    });
  });
});

