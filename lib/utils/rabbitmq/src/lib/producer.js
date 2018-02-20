'use strict';

const { isEmpty, isString } = require('underscore');
const util = require('util');

const producerSetup = (queueName) =>
  (channel) => channel.assertQueue(queueName, { durable: true });

const validateChannel = (channel) => {
  if(!channel)
    throw new Error('Channel is not set');
};

class Producer {

  constructor(connectionManager, queueName) {
    if (!connectionManager || !connectionManager.connect)
      throw new Error(util.format('Invalid connection manager: %j', connectionManager));

    if(isEmpty(queueName) || !isString(queueName))
      throw new Error(util.format('Invalid queue name: %j', queueName));

    this.connectionManager = connectionManager;
    this.queueName = queueName;
  }

  async connect() {
    this.channel = await this.connectionManager.connect(producerSetup(this.queueName));
  }

  async send(msg) {
    validateChannel(this.channel);

    await this.channel.sendToQueue(
      this.queueName,
      msg,
      { persistent: true }
    );
  };

  async close() {
    validateChannel(this.channel);

    await this.channel.close();
  }
}

module.exports = Producer;
