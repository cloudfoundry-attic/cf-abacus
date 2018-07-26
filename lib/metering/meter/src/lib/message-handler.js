'use strict';

const metrics = require('abacus-metrics');
const moment = require('abacus-moment');
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
    const handleStartTime = moment.utc();
    const inputUsageDocument = message.usageDoc;
    try {
      debug('Start processing message: %j', inputUsageDocument);
      const normalizedUsageDoc = await this.normalizer.normalizeUsage(inputUsageDocument);
      const meteredUsageDoc = await this.meter.meterUsage(normalizedUsageDoc);
      const outputDoc = await this.accumulatorClient.postUsage(meteredUsageDoc);
      await this.outputDb.put(outputDoc);
    } catch (e) {
      edebug('Error while processing document: %o', e);
      metrics.bulletin('message.handle.error').post(e.message);
      if (e.isPlanBusinessError || e.isOutOfSlackError || message.metadata.retryCount >= this.allowedFails)
        await this.errorDb.put(extend({}, message, { error: e }));
      else
        throw e;
    } finally {
      const handleEndTime = moment.utc();
      metrics.gauge('message.handle.duration.millis').set(handleEndTime.diff(handleStartTime));
    }
  }
}

module.exports.MessageHandler = MessageHandler;
