'use strict';

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
  if (!channelConfig || !channelConfig.queueName || !channelConfig.prefetchLimit)
    throw new Error('Invalid queue configuration');
};

class Consumer {

  constructor(channelConfig, connectionManager, messageHandler) {
    validateConfig(channelConfig);

    if (!connectionManager || !connectionManager.connect)
      throw new Error('Invalid connection manager');

    if (!messageHandler || !messageHandler.handle)
      throw new Error('Invalid message handler');

    this.channelConfig = channelConfig;
    this.connectionManager = connectionManager;
    this.messageHandler = messageHandler;
  }

  process() {
    const channelFn = (channel) => Promise.all([
      channel.assertQueue(this.channelConfig.queueName, { durable: true }),
      channel.prefetch(this.channelConfig.prefetchLimit),
      channel.consume(this.channelConfig.queueName, async(message) => {
        // TODO: get message content
        const result = await this.messageHandler.handle(message);

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

    this.channel = this.connectionManager.connect(channelFn);
  };

  async close() {
    checkChannel(this.channel);
    await this.channel.close();
  }
}

module.exports = Consumer;
module.exports.MessageHandleStatus = MessageHandleStatus;
