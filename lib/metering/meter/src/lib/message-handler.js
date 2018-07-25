'use strict';

const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-usage-metering-message-handler');
const edebug = require('abacus-debug')('e-abacus-usage-metering-message-handler');

class MessageHandler {
  constructor(normalizer, meter, accumulatorClient, db, allowedFails) {
    this.meter = meter;
    this.errorDb = db.error;
    this.outputDb = db.output;
    this.normalizer = normalizer;
    this.allowedFails = allowedFails;
    this.accumulatorClient = accumulatorClient;
  }

  async handle(message) {
    const inputUsageDocument = message.usageDoc;
    try {
      debug('Start processing message: %j', inputUsageDocument);
      const normalizedUsageDoc = await this.normalizer.normalizeUsage(inputUsageDocument);
      const meteredUsageDoc = await this.meter.meterUsage(normalizedUsageDoc);
      const outputDoc = await this.accumulatorClient.postUsage(meteredUsageDoc);
      await this.outputDb.put(outputDoc);
    } catch(e) {
      edebug('Error while processing document: %o', e);
      if(e.isPlanBusinessError || e.isOutOfSlackError || message.metadata.retryCount >= this.allowedFails)
        await this.errorDb.put(extend({}, message, { error: e }));
      else
        throw e;
    }
  }
}

module.exports.MessageHandler = MessageHandler;
