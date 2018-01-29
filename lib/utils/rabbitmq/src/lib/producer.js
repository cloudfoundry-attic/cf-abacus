'use strict';

const { isEmpty, isString } = require('underscore');
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
