'use strict';

const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-usage-metering-message-handler');
const edebug = require('abacus-debug')('e-abacus-usage-metering-message-handler');

class MessageHandler {
  constructor(normalizer, meter, accumulatorClient, outputDb, errorDb) {
    this.normalizer = normalizer;
    this.meter = meter;
    this.accumulatorClient = accumulatorClient;
    this.outputDb = outputDb;
    this.errorDb = errorDb;
  }

  async handle(inputUsageDocument) {
    try {
      debug('Start processing message: %j', inputUsageDocument);
      const normalizedUsageDoc = await this.normalizer.normalizeUsage(inputUsageDocument);
      const meteredUsageDoc = await this.meter.meterUsage(normalizedUsageDoc);
      const outputDoc = await this.accumulatorClient.postUsage(meteredUsageDoc);
      await this.outputDb.put(outputDoc);
    } catch(e) {
      edebug('Error while processing document: %о', e);
      if(e.isPlanBusinessError)
        await this.errorDb.put(extend({}, inputUsageDocument, { error: e }));
      else
        throw e;
    }
  }
}

module.exports.MessageHandler = MessageHandler;
