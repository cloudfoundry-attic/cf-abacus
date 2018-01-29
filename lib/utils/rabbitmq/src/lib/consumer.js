'use strict';

const { isEmpty, isString, isFunction } = require('underscore');
const util = require('util');

const prefetchLimit = () => parseInt(process.env.PREFETCH_LIMIT) || 100;

const consumerSetup = (queueName, msgHandler) => (channel) =>
  Promise.all([
    channel.assertQueue(queueName, { durable: true }),
    channel.prefetch(prefetchLimit()),
    channel.consume(queueName, msgHandler)
  ]);

class Consumer {

  constructor(connectionManager, queueName, messageHandler) {
    if (!connectionManager || !connectionManager.connect)
      throw new Error(util.format('Invalid connection manager: %j', connectionManager));

    if(isEmpty(queueName) || !isString(queueName))
      throw new Error(util.format('Invalid queue name: %j', queueName));

    if(!isFunction(messageHandler))
      throw new Error('Message handler should be a function');

    this.connectionManager = connectionManager;
    this.messageHandler = messageHandler;
    this.queueName = queueName;
  }

  consume() {
    this.channel = this.connectionManager.connect(consumerSetup(this.queueName, this.messageHandler));
  }

  ack(msg) {
    this.channel.ack(msg);
  }

  nack(msg) {
    this.channel.nack(msg);
  }

  async close() {
    await this.channel.close();
  }
}

module.exports = Consumer;
