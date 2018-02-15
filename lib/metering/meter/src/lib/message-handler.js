'use strict';

const MessageHandleStatus = require('abacus-rabbitmq').Consumer.MessageHandleStatus;

class MessageHandler {

  constructor(normalizer, meter, accumulatorClient) {
    this.normalizer = normalizer;
    this.meter = meter;
    this.accumulatorClient = accumulatorClient;
  }

  async handle(msg) {
    try{
      const normalizedUsageDoc = await this.normalizer.normalizeUsage(msg);
      const meterDoc = await this.meter.meterUsage(normalizedUsageDoc);
      await this.accumulatorClient.sendUsage(meterDoc);
      return MessageHandleStatus.SUCCESS;
    } catch (e) {
      if (e.isPlanBusinessError)
        return MessageHandleStatus.CANNOT_PROCESS;
      return MessageHandleStatus.RETRY;
    }

  }
}

module.exports.MessageHandler = MessageHandler;
