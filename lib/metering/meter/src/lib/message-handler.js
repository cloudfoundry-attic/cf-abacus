'use strict';

// const MessageHandleStatus = require('abacus-rabbitmq').Consumer.MessageHandleStatus;

const debug = require('abacus-debug')('abacus-usage-meter-message-handler');
const edebug = require('abacus-debug')('e-abacus-usage-meter-message-handler');

class MessageHandler {

  constructor(normalizer, meter, accumulatorClient, errorDb) {
    this.normalizer = normalizer;
    this.meter = meter;
    this.accumulatorClient = accumulatorClient;
    this.errorDb = errorDb;
  }

  async handle(msg) {
    debug('Porcessing message: %o', msg);
    try{
      const normalizedUsageDoc = await this.normalizer.normalizeUsage(msg);
      const meterDoc = await this.meter.meterUsage(normalizedUsageDoc);
      await this.accumulatorClient.postUsage(meterDoc);
    } catch (e) {
      edebug('Error processing message %o', e);
      if (e.isPlanBusinessError)
        try {
          await this.errorDb.store(msg, e);
        } catch (err) {
          edebug('Error while storing errored message [%o] to error db: %o', msg, e);
          throw err;
        }
      else if(e.isDuplicateMessage)
        edebug('Duplicate error [%o] while sending to Accumulator: %o', msg, e);
      else
        throw e;
    }
  }
}

module.exports.MessageHandler = MessageHandler;
