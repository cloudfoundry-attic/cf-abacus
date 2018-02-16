'use strict';

const MessageHandleStatus = require('abacus-rabbitmq').Consumer.MessageHandleStatus;
// Class or function ???
class MessageHandler {

  constructor(normalizer, meter, accumulatorClient, errorDb) {
    this.normalizer = normalizer;
    this.meter = meter;
    this.accumulatorClient = accumulatorClient;
    this.errorDb = errorDb;
  }

  async handle(msg) {
    try{
      const normalizedUsageDoc = await this.normalizer.normalizeUsage(msg);
      const meterDoc = await this.meter.meterUsage(normalizedUsageDoc);
      await this.accumulatorClient.sendUsage(meterDoc);
      return MessageHandleStatus.SUCCESS;
    } catch (e) {
      if (e.isPlanBusinessError)
        try {
          await this.errorDb.store(msg, e);
          return MessageHandleStatus.CANNOT_PROCESS;
        } catch (err) {
          return MessageHandleStatus.RETRY;
        }
      return MessageHandleStatus.RETRY;
    }

  }
}

module.exports.MessageHandler = MessageHandler;
