'use strict';

const metrics = require('abacus-metrics');
const moment = require('abacus-moment');
const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-usage-metering-message-handler');
const edebug = require('abacus-debug')('e-abacus-usage-metering-message-handler');

const isErrorDbWritable = (e) => {
  if (e.isPlanBusinessError || e.isOutOfSlackError || e.isFutureUsageError)
    return true;
  return false;
};

class MessageHandler {
  constructor(duplicateDetector, normalizer, meter, accumulatorClient, db, allowedFails) {
    this.meter = meter;
    this.errorDb = db.error;
    this.outputDb = db.output;
    this.normalizer = normalizer;
    this.allowedFails = allowedFails;
    this.accumulatorClient = accumulatorClient;
    this.duplicateDetector = duplicateDetector;
  }

  async handle(message) {
    const inputUsageDocument = message.usageDoc;
    try {
      debug('Start processing message: %j', inputUsageDocument);

      if(inputUsageDocument.end > moment.utc().endOf('day').valueOf()) {
        debug('Future usage detected. Storing in error db ...');
        throw { isFutureUsageError: true };
      }

      if(await this.duplicateDetector.isDuplicate(inputUsageDocument)) {
        debug('Duplicate usage. Skipping...');
        return;
      }

      const normalizedUsageDoc = await this.normalizer.normalizeUsage(inputUsageDocument);
      const meteredUsageDoc = await this.meter.meterUsage(normalizedUsageDoc);
      const outputDoc = await this.accumulatorClient.postUsage(meteredUsageDoc);
      await this.outputDb.put(outputDoc);
      debug('Processed message: %j', inputUsageDocument);
    } catch (error) {
      edebug('Error while processing document: %o', error);
      if(isErrorDbWritable(error) || message.metadata.retryCount >= this.allowedFails)
        await this.errorDb.put(extend({}, message, { error }));
      else
        throw error;
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

const createMessageHandler = (duplicateDetector, normalizer, meter, accumulatorClient, db, allowedFails) =>
  monitoredHandler(new MessageHandler(duplicateDetector, normalizer, meter, accumulatorClient, db, allowedFails));

module.exports = { createMessageHandler };
