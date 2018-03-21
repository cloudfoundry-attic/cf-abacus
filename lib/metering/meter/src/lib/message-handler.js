'use strict';

const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-meter-message-handler');
const edebug = require('abacus-debug')('e-abacus-meter-message-handler');

const duplicateDocumentErrorCode = 409;

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
      debug('Start processing message: %o', inputUsageDocument);
      const normalizedUsageDoc = await this.normalizer.normalizeUsage(inputUsageDocument);
      const meteredUsageDoc = await this.meter.meterUsage(normalizedUsageDoc);
      await this.accumulatorClient.postUsage(meteredUsageDoc);
      await this.outputDb.put(meteredUsageDoc);
    } catch(e) {
      edebug('Error while processing document %o', e);
      if(e.isPlanBusinessError)
        try {
          await this.errorDb.put(extend({}, inputUsageDocument, { error: e }));
        } catch(err) {
          edebug('Error writing into error DB: %o', err);
          if(err.status !== duplicateDocumentErrorCode)
            throw err;
        }
      else
        throw e;
    }
  }
}

module.exports.MessageHandler = MessageHandler;
