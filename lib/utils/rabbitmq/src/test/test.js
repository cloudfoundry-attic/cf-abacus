'use strict';

const { Producer, Consumer, amqpMessageParser, ConnectionManager } = require('abacus-rabbitmq');
const queueName = 'task_queue';
const queueExchange = 'test-queue-exchange';

const uri = process.env.RABBIT_URI || 'amqp://localhost:5672';
const numberOfAllMessages = 17;

describe('abacus-rabbitmq-test', () => {
  const connectionManager = new ConnectionManager([uri]);
  let consumer;
  let producer;
  const messages = new Set();

  const config = {
    mainQueue: {
      name: queueName,
      exchange:  queueExchange,
      routingKey: '#',
      prefetchLimit: 2
    },
    deadLetterQueues: [{
      name:  'test-1-dl-queue',
      exchange: 'test-1-dl-exchange',
      mainExchange: queueExchange,
      routingKey: '#',
      ttl: 200,
      retryAttempts: 100
    },
    {
      name: 'test-2-dl-queue',
      exchange: 'test-2-dl-exchange',
      mainExchange: queueExchange,
      routingKey: '#',
      ttl: 500,
      retryAttempts: 150
    }]
  };

  beforeEach(async () => {
    producer = new Producer(connectionManager, queueName);
    await producer.connect();
    for (let i = 0; i < numberOfAllMessages; i++) {
      const message = `msg${i}`;
      await producer.send(message);
      messages.add(message);
    }
    consumer = new Consumer(connectionManager, amqpMessageParser, config);
  });

  afterEach(async () => {
    await producer.close();
    await consumer.close();
  });

  it('receives all messages', (done) => {
    const handler = { handle: (msg) => {
      messages.delete(msg.usageDoc);
      if (messages.size === 0)
        done();
    } };
    consumer.process(handler);
  });

  it('retries errored messages', (done) => {
    const nackedMessages = new Set();
    const ackedMessages = new Set();

    const handler = { handle: (msg) => {
      const messageText = msg.usageDoc;
      if (nackedMessages.has(messageText))
        ackedMessages.add(messageText);
      else {
        nackedMessages.add(messageText);
        throw new Error('Error nacked!');
      }

      messages.delete(messageText);

      if (nackedMessages.size === numberOfAllMessages &&
          ackedMessages.size === numberOfAllMessages)
        done();

    } };
    consumer.process(handler);
  });
});
