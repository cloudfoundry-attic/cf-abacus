'use strict';

const _ = require('underscore');
const isEmpty = _.isEmpty;
const isString = _.isString;
const isFunction = _.isFunction;

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

    this.queueName = queueName;
    this.channel = connectionManager.connect(consumerSetup(queueName, messageHandler));

    // Bind the class functions to the object context.
    // The result is that function will always have 'this' set to class context.
    this.ack.bind(this);
    this.nack.bind(this);
    this.close.bind(this);
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
