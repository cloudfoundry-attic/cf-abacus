'use strict';

const MessageHandleStatus = require('abacus-rabbitmq').Consumer.MessageHandleStatus;

// const debug = require('abacus-debug')('abacus-usage-metering-meter');
// const edebug = require('abacus-debug')('e-abacus-usage-metering-meter');

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
      console.log('Normalize finished');
      const meterDoc = await this.meter.meterUsage(normalizedUsageDoc);
      console.log('Meter finished');
      await this.accumulatorClient.postUsage(meterDoc);
      return MessageHandleStatus.SUCCESS;
    } catch (e) {
      console.log('Error1 ', e);
      if (e.isPlanBusinessError)
        try {
          await this.errorDb.store(msg, e);
          return MessageHandleStatus.CANNOT_PROCESS;
        } catch (err) {
          console.log('Error2');
          return MessageHandleStatus.RETRY;
        }
      return MessageHandleStatus.RETRY;
    }

  }
}

module.exports.MessageHandler = MessageHandler;
