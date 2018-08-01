'use strict';

const Consumer = require('../lib/consumer');

const config = {
  mainQueue: {
    name: 'consumer-test-queue',
    exchange: 'consumer-test-main-exchange',
    routingKey: '#',
    prefetchLimit: 2
  },
  deadLetterQueues: [
    {
      name: 'consumer-test-first-dl',
      exchange: 'consumer-test-first-dl-exchange',
      mainExchange: 'consumer-test-main-exchange',
      routingKey: '#',
      ttl: 180000,
      retryAttempts: 100
    },
    {
      name: 'consumer-test-second-dl',
      exchange: 'consumer-test-second-dl-exchange',
      mainExchange: 'consumer-test-main-exchange',
      routingKey: '#',
      ttl: 1620000,
      retryAttempts: 100
    }
  ]
};

describe('Consumer', () => {
  const sandbox = sinon.sandbox.create();
  let fakeChannel;
  let fakeConnectionManager;
  let fakeHandler;
  let fakeParser;
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

    fakeParser = {
      toJSON: sandbox.stub(),
      toRabbitMessage: sandbox.stub()
    };

    consumer = new Consumer(fakeConnectionManager, fakeParser, config);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('process queue', () => {
    let amqpChannel;

    beforeEach(async() => {
      amqpChannel = {
        assertExchange: sandbox.stub(),
        assertQueue: sandbox.stub(),
        bindQueue: sandbox.stub(),
        prefetch: sandbox.stub(),
        consume: sandbox.stub(),
        publish: sandbox.stub(),
        nack: sandbox.stub(),
        ack: sandbox.stub()
      };

      await consumer.process(fakeHandler);
    });

    const assertCorrectSetupFn = (setupFn) => {
      setupFn(amqpChannel);
      assert.calledWith(amqpChannel.assertQueue.firstCall, config.mainQueue.name, { durable: true });
      assert.calledWith(amqpChannel.assertQueue.secondCall,
        config.deadLetterQueues[0].name, { durable: true, arguments: {
          'x-dead-letter-exchange': config.deadLetterQueues[0].mainExchange,
          'x-dead-letter-routing-key': config.deadLetterQueues[0].routingKey,
          'x-message-ttl': config.deadLetterQueues[0].ttl
        } });
      assert.calledWith(amqpChannel.assertQueue.thirdCall,
        config.deadLetterQueues[1].name, { durable: true, arguments: {
          'x-dead-letter-exchange': config.deadLetterQueues[1].mainExchange,
          'x-dead-letter-routing-key': config.deadLetterQueues[1].routingKey,
          'x-message-ttl': config.deadLetterQueues[1].ttl
        } });

      assert.calledWith(amqpChannel.assertExchange.firstCall, config.mainQueue.exchange, 'direct', { durable: true });
      assert.calledWith(amqpChannel.assertExchange.secondCall,
        config.deadLetterQueues[0].exchange, 'direct', { durable: true });
      assert.calledWith(amqpChannel.assertExchange.thirdCall,
        config.deadLetterQueues[1].exchange, 'direct', { durable: true });

      assert.calledWith(amqpChannel.bindQueue.firstCall,
        config.mainQueue.name, config.mainQueue.exchange, config.mainQueue.routingKey);
      assert.calledWith(amqpChannel.bindQueue.secondCall,
        config.deadLetterQueues[0].name, config.deadLetterQueues[0].exchange, config.deadLetterQueues[0].routingKey);
      assert.calledWith(amqpChannel.bindQueue.thirdCall,
        config.deadLetterQueues[1].name, config.deadLetterQueues[1].exchange, config.deadLetterQueues[1].routingKey);

      assert.calledWith(amqpChannel.prefetch, config.mainQueue.prefetchLimit);
      assert.calledWith(amqpChannel.consume, config.mainQueue.name);
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

          fakeParser.toJSON.returns({ metadata: { retryCount: 0 }, usageDoc: 'some usage doc' });
          fakeHandler.handle.returns(Promise.resolve());

          await consumeCallback(message);
        });

        it('message is acked', () => {
          assert.calledOnce(fakeParser.toJSON);
          assert.calledWith(fakeParser.toJSON, message);

          assert.calledOnce(fakeHandler.handle);
          assert.calledWith(fakeHandler.handle, { metadata: { retryCount: 0 }, usageDoc: 'some usage doc' });

          assert.calledOnce(amqpChannel.ack);
          assert.calledWith(amqpChannel.ack, message);

          assert.notCalled(amqpChannel.nack);
        });

      });

      // TODO: The following context should be removed after productive adoption of DeadLetterQueues

      context('when message with OLD format is handled successfully', () => {
        const message = 'message';

        beforeEach(async() => {
          const consumeCallback = amqpChannel.consume.args[0][1];

          fakeParser.toJSON.returns({ org: 'org' });
          fakeHandler.handle.returns(Promise.resolve());

          await consumeCallback(message);
        });

        it('message is acked', () => {
          assert.calledOnce(fakeParser.toJSON);
          assert.calledWith(fakeParser.toJSON, message);

          assert.calledOnce(fakeHandler.handle);
          assert.calledWith(fakeHandler.handle, { metadata: { retryCount: 0 }, usageDoc: { org: 'org' } });

          assert.calledOnce(amqpChannel.ack);
          assert.calledWith(amqpChannel.ack, message);

          assert.notCalled(amqpChannel.nack);
        });

      });

      context('when message handling throws', () => {
        let consumeCallback;

        const message = (count) => ({
          content: `{"metadata":{"retryCount":${count}},"usageDoc":"usageDoc"}`
        });

        beforeEach(async() => {
          consumeCallback = amqpChannel.consume.args[0][1];
        });

        context('on first try', () => {
          const rabbitMsg = message(1);
          beforeEach(async() => {
            fakeHandler.handle.returns(Promise.reject(new Error()));
            fakeParser.toJSON.returns(JSON.parse(rabbitMsg.content));
            fakeParser.toRabbitMessage.returns(new Buffer(JSON.stringify(message(2).content)));
            await consumeCallback(rabbitMsg);
          });

          it('should publish to first retry queue', () => {
            assert.calledOnce(amqpChannel.publish);
            assert.calledWith(amqpChannel.publish,
              config.deadLetterQueues[0].exchange,
              config.deadLetterQueues[0].routingKey,
              new Buffer(JSON.stringify(message(2).content)),
              { persistent: true });
          });

          it('message is acked', () => {
            assert.calledWith(amqpChannel.ack, rabbitMsg);
            assert.notCalled(amqpChannel.nack);
          });
        });

        context('on consecutive try', () => {
          beforeEach(async() => {
            fakeHandler.handle.returns(Promise.reject(new Error()));
            fakeParser.toJSON.returns(JSON.parse(message(config.deadLetterQueues[0].retryAttempts).content));
            fakeParser.toRabbitMessage.returns(
              new Buffer(JSON.stringify(message(config.deadLetterQueues[0].retryAttempts + 1).content)));
            await consumeCallback(message(config.deadLetterQueues[0].retryAttempts));
          });

          it('should publish to next retry queue', () => {
            assert.calledOnce(amqpChannel.publish);
            assert.calledWith(amqpChannel.publish,
              config.deadLetterQueues[1].exchange,
              config.deadLetterQueues[1].routingKey,
              new Buffer(JSON.stringify(message(config.deadLetterQueues[0].retryAttempts + 1).content)),
              { persistent: true });
          });

          it('message is acked', () => {
            assert.calledWith(amqpChannel.ack, message(config.deadLetterQueues[0].retryAttempts));
            assert.notCalled(amqpChannel.nack);
          });
        });

        context('when message has no metadata', () => {
          const rabbitMsg = '{ "someProp": "some val" }';
          const messageContentBuffer = new Buffer(
            JSON.stringify({ metadata: { retryCount: 1 }, usageDoc: JSON.parse(rabbitMsg) }));

          beforeEach(async() => {
            fakeHandler.handle.returns(Promise.reject(new Error()));
            fakeParser.toJSON.returns(JSON.parse(rabbitMsg));
            fakeParser.toRabbitMessage.returns(messageContentBuffer);
            await consumeCallback(rabbitMsg);
          });

          it('should initialize metadata', () => {
            assert.notCalled(amqpChannel.nack);

            assert.calledOnce(amqpChannel.publish);
            assert.calledWith(amqpChannel.publish,
              config.deadLetterQueues[0].exchange,
              config.deadLetterQueues[0].routingKey,
              messageContentBuffer,
              { persistent: true });

            assert.calledWith(amqpChannel.ack, rabbitMsg);
          });
        });
      });
    });
  });

  describe('close Consumer', () => {
    let consumer;

    beforeEach(() => {
      fakeConnectionManager.connect.returns(fakeChannel);
      consumer = new Consumer(fakeConnectionManager, fakeParser, config);
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

