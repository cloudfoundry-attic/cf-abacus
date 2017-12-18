'use strict';

const rabbitmq = require('abacus-rabbitmq');
const queueName = 'task_queue';

const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const uri = process.env.RABBITMQ_URL || 'amqp://R9cjafcvAhs-tWVu:hDn7u10JFRFAfwfS@localhost:12345';

describe('abacus-rabbitmq-itest', () => {
  const connectionManager = new rabbitmq.ConnectionManager([uri]);

  const messages = new Set();

  before(functioncb(function*() {
    const producer = new rabbitmq.Producer(connectionManager, queueName);
    for (let i = 0; i < 25; i++) {
      const message = `msg${i}`;
      yield producer.send(message);
      messages.add(message);
    }
  }));

  const unquote = (str) => str.substr(1, str.length - 2);

  it('recieves all messages', (done) => {
    const consumer = new rabbitmq.Consumer(connectionManager, queueName, (msg) => {
      functioncb(function*() {
        yield consumer.ack(msg);
      })((err) => {
        if (err)
          done(err);
      });

      messages.delete(unquote(msg.content.toString()));
      if (messages.size === 0)
        done();
    });
  });
});
