'use strict';

const debug = require('abacus-debug')('abacus-rabbit-consumer');
const edebug = require('abacus-debug')('e-abacus-rabbit-consumer');

const MessageHandleStatus = {
  SUCCESS: 'SUCCESS',
  RETRY: 'RETRY',
  CANNOT_PROCESS: 'CANNOT_PROCESS'
};

const checkChannel = (channel) => {
  if(!channel)
    throw new Error('Consumer is not connected');
};

const validateConfig = (channelConfig) => {
  if (!channelConfig || !channelConfig.queueName || !channelConfig.prefetchLimit) {
    edebug('Wrong channel configuration %o', channelConfig);
    throw new Error('Invalid channel configuration');
  }
};

class Consumer {

  constructor(channelConfig, connectionManager, messageHandler) {
    validateConfig(channelConfig);

    if (!connectionManager || !connectionManager.connect) {
      edebug('Invalid connection manager argument');
      throw new Error('Invalid connection manager');
    }

    if (!messageHandler || !messageHandler.handle) {
      edebug('Invalid message handler argument');
      throw new Error('Invalid message handler');
    }

    this.channelConfig = channelConfig;
    this.connectionManager = connectionManager;
    this.messageHandler = messageHandler;
  }

  async process() {
    const channelFn = (channel) => Promise.all([
      channel.assertQueue(this.channelConfig.queueName, { durable: true }),
      channel.prefetch(this.channelConfig.prefetchLimit),
      channel.consume(this.channelConfig.queueName, async(message) => {
        debug('Message consumed');
        // TODO: get message content
        const result = await this.messageHandler.handle(message);
        debug('Message handled with status %s', result);

        if (result === MessageHandleStatus.SUCCESS)
          channel.ack(message);
        else if (result === MessageHandleStatus.RETRY)
          // TODO: check if some deliveryTag is hit
          channel.nack(message);
        else if (result === MessageHandleStatus.CANNOT_PROCESS)
          // TODO: errorDb.put(message);
          channel.ack(message);
      })
    ]);

    this.channel = await this.connectionManager.connect(channelFn);
    debug('Consumer connected to queue %s', this.channelConfig.queueName);
  };

  async close() {
    checkChannel(this.channel);
    await this.channel.close();
  }
}

module.exports = Consumer;
module.exports.MessageHandleStatus = MessageHandleStatus;
