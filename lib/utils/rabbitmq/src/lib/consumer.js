'use strict';

const debug = require('abacus-debug')('abacus-rabbit-consumer');
const edebug = require('abacus-debug')('e-abacus-rabbit-consumer');
const pdebug = require('abacus-debug')('p-abacus-rabbit-consumer');

const checkChannel = (channel) => {
  if(!channel)
    throw new Error('Consumer is not connected');
};

const setupQueue = async(channel, mainQueue) => Promise.all([
  channel.assertQueue(mainQueue.name, { durable: true }),
  channel.assertExchange(mainQueue.exchange, 'direct', { durable: true }),
  channel.bindQueue(mainQueue.name, mainQueue.exchange, mainQueue.routingKey)
]);

const publishToExchange = (channel, messageParser, message, deadLetterQueues) => {
  const failures = message.metadata.retryCount;
  debug(`Publishing to dead letter exchange. Current retries: ${failures}`);

  // Sum allowed retries for all previous queues
  let retries = 0;
  // figure out which dead letter queue to use
  for(let i in deadLetterQueues)
    // failures <= Max allowed retries for a particual message in current queue
    if(failures <= deadLetterQueues[i].retryAttempts + retries) {
      pdebug(`Publishing to DL exchange ${deadLetterQueues[i].exchange}. Retries: ${failures}`);
      channel.publish(deadLetterQueues[i].exchange, deadLetterQueues[i].routingKey,
        messageParser.toRabbitMessage(message), { persistent: true });
      break;
    } else retries += deadLetterQueues[i].retryAttempts;
};

const setupDeadLetterQueue = async(channel, dlQueue) => Promise.all([
  channel.assertQueue(dlQueue.name, { durable: true, arguments: {
    'x-dead-letter-exchange': dlQueue.mainExchange,
    'x-dead-letter-routing-key': dlQueue.routingKey,
    'x-message-ttl': dlQueue.ttl
  } }),
  channel.assertExchange(dlQueue.exchange, 'direct', { durable: true }),
  channel.bindQueue(dlQueue.name, dlQueue.exchange, dlQueue.routingKey)
]);

class Consumer {

  constructor(connectionManager, messageParser, config) {
    this.connectionManager = connectionManager;
    this.messageParser = messageParser;
    this.config = config;
  }

  async process(messageHandler) {
    const channelFn = (conf) => (channel) => Promise.all([
      setupQueue(channel, conf.mainQueue),
      setupDeadLetterQueue(channel, conf.deadLetterQueues[0]),
      setupDeadLetterQueue(channel, conf.deadLetterQueues[1]),
      channel.prefetch(conf.mainQueue.prefetchLimit),
      channel.consume(conf.mainQueue.name, async(rabbitMessage) => {
        let message = this.messageParser.toJSON(rabbitMessage);
        if(!message.metadata)
          message = { usageDoc: message, metadata: { retryCount: 0 } };
        try {
          await messageHandler.handle(message);
          await channel.ack(rabbitMessage);
        } catch (err) {
          edebug('Failed to process message, returning to queue, error %o', err);
          message.metadata.retryCount = message.metadata.retryCount + 1;
          publishToExchange(channel, this.messageParser, message, this.config.deadLetterQueues);
          channel.ack(rabbitMessage);
        }
      })
    ]);

    debug('Connecting consumer to queue %s ...', this.config.mainQueue.name);
    this.channel = await this.connectionManager.connect(channelFn(this.config));
    debug('Consumer for queue %s connected', this.config.mainQueue.name);
  };

  async close() {
    checkChannel(this.channel);
    await this.channel.close();
  }
}

module.exports = Consumer;
