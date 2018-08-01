'use strict';

const metrics = require('abacus-metrics');
const moment = require('abacus-moment');
const { extend, pick } = require('underscore');

const debug = require('abacus-debug')('abacus-usage-metering-message-handler');
const edebug = require('abacus-debug')('e-abacus-usage-metering-message-handler');

const flatten = (message) => extend({}, message.usageDoc, pick(message, 'metadata'));

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
    } catch (e) {
      edebug('Error while processing document: %o', e);
      if (e.isPlanBusinessError || e.isOutOfSlackError || message.metadata.retryCount >= this.allowedFails)
        await this.errorDb.put(extend({}, flatten(message), { error: e }));
      else
        throw e;
    }
  }
}

const monitoredHandler = (original) => {
  return extend({}, original, {
    handle: async(message) => {
      metrics.counter('message.handle.count').inc();
      const handleStartTime = moment.utc();
      try {
        await original.handle(message);
      } catch (e) {
        metrics.gauge('message.handle.error.retries').set(message.metadata.retryCount);
        metrics.bulletin('message.handle.error').post(`error: '${e.message}'; retries: ${message.metadata.retryCount}`);
        throw e;
      } finally {
        const handleEndTime = moment.utc();
        metrics.gauge('message.handle.duration.millis').set(handleEndTime.diff(handleStartTime));
      }
    }
  });
};

const createMessageHandler = (normalizer, meter, accumulatorClient, db, allowedFails) =>
  monitoredHandler(new MessageHandler(normalizer, meter, accumulatorClient, db, allowedFails));

module.exports = { createMessageHandler };
