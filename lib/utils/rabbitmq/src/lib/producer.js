'use strict';

const _ = require('underscore');
const isEmpty = _.isEmpty;
const isString = _.isString;

const util = require('util');

const producerSetup = (queueName) =>
  (channel) => channel.assertQueue(queueName, { durable: true });

class Producer {

  constructor(connectionManager, queueName) {
    if (!connectionManager || !connectionManager.connect)
      throw new Error(util.format('Invalid connection manager: %j', connectionManager));

    if(isEmpty(queueName) || !isString(queueName))
      throw new Error(util.format('Invalid queue name: %j', queueName));

    this.queueName = queueName;
    this.channel = connectionManager.connect(producerSetup(queueName));

    // Bind the class functions to the object context.
    // The result is that function will always have 'this' set to class context.
    this.send.bind(this);
    this.close.bind(this);
  }

  async send(msg) {
    await this.channel.sendToQueue(
      this.queueName,
      msg,
      { persistent: true }
    );
  };

  async close() {
    await this.channel.close();
  }
}

module.exports = Producer;
