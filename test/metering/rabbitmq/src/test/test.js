'use strict';

const rabbitmq = require('abacus-rabbitmq');
let queueName = 'task_queue';

const uri = process.env.RABBITMQ_URL || 'amqp://R9cjafcvAhs-tWVu:hDn7u10JFRFAfwfS@localhost:12345';
const numberOfAllMessages = 25;

describe('abacus-rabbitmq-itest', () => {
  const connectionManager = new rabbitmq.ConnectionManager([uri]);
  let consumer;
  let producer;
  const messages = new Set();

  beforeEach(async function() {
    producer = new rabbitmq.Producer(connectionManager, queueName);
    for (let i = 0; i < numberOfAllMessages; i++) {
      const message = `msg${i}`;
      await producer.send(message);
      messages.add(message);
    }
  });

  afterEach(async function() {
    await producer.close();
    await consumer.close();
  });

  const unquote = (str) => str.substr(1, str.length - 2);

  it('receives all messages', (done) => {
    consumer = new rabbitmq.Consumer(connectionManager, queueName, (msg) => {
      consumer.ack(msg);
      messages.delete(unquote(msg.content.toString()));
      if (messages.size === 0)
        done();
    });
  });

  it('receives NACKed messages', (done) => {
    const nackedMessages = new Set();
    const ackedMessages = new Set();

    consumer = new rabbitmq.Consumer(connectionManager, queueName, (msg) => {
      const messageText = unquote(msg.content.toString());

      if (nackedMessages.has(messageText)) {
        consumer.ack(msg);
        ackedMessages.add(messageText);
      } else {
        nackedMessages.add(messageText);
        consumer.nack(msg);
      }

      messages.delete(unquote(msg.content.toString()));

      if (nackedMessages.size === numberOfAllMessages &&
          ackedMessages.size === numberOfAllMessages)
        done();
    });
  });
});
