'use strict';

const debug = require('abacus-debug')('abacus-rabbit-consumer');
const edebug = require('abacus-debug')('e-abacus-rabbit-consumer');

const MessageHandleStatus = {
  SUCCESS: 'SUCCESS',
  RETRY: 'RETRY',
  CANNOT_PROCESS: 'CANNOT_PROCESS',
  DUPLICATE: 'DUPLICATE'
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

  constructor(connectionManager, queueName, prefetchLimit) {
    validateConfig(channelConfig);

    if (!connectionManager || !connectionManager.connect) {
      edebug('Invalid connection manager argument');
      throw new Error('Invalid connection manager');
    }

    if (!messageHandler || !messageHandler.handle) {
      edebug('Invalid message handler argument');
      throw new Error('Invalid message handler');
    }

    this.connectionManager = connectionManager;
    // this.channelConfig = channelConfig;
  }

  async process(messageHandler) {
    const channelFn = (channel) => Promise.all([
      channel.assertQueue(this.channelConfig.queueName, { durable: true }),
      channel.prefetch(this.channelConfig.prefetchLimit),
      channel.consume(this.channelConfig.queueName, async(message) => {
        debug('Message consumed');
        // TODO: get message content

        try {
          await this.messageHandler.handle(message);
          channel.ack(message);
        } catch (err) {
          edebug('Failed to process message, returning to queue, error %o', err);
          channel.nack(message);
        }

        const result = await this.messageHandler.handle(message);
        debug('Message handled with status %s', result);

        if (result === MessageHandleStatus.SUCCESS || result === MessageHandleStatus.CANNOT_PROCESS
          || result === MessageHandleStatus.CONFLICT)
          channel.ack(message);
        else if (result === MessageHandleStatus.RETRY)
          // TODO: check if some deliveryTag is hit
          channel.nack(message);
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
