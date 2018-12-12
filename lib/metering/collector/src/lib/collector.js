'use strict';

const { omit, extend } = require('underscore');

const moment = require('abacus-moment');
const metrics = require('abacus-metrics');

const {
  InvalidSchemaError,
  InvalidPlanError,
  UnsupportedLicenseTypeError
} = require('./usage-validator');

const errorBulletin = 'usage.collect.error';

class Collector {

  constructor(validator, producer) {
    this.validator = validator;
    this.producer = producer;
  };

  async collect(usageDoc) {
    await this.validator.validate(omit(usageDoc, 'processed_id'));
    await this.producer.send(usageDoc);
  }
}

const monitoredCollector = (original) => {
  return extend({}, original, {
    collect: async(usageDoc) => {
      const collectStartTime = moment.utc();

      try {
        await original.collect(usageDoc);
        metrics.counter('usage.collect.producer.send').inc();
      } catch (error) {
        if (error instanceof InvalidSchemaError || error instanceof InvalidPlanError)
          metrics.bulletin(errorBulletin).post('Invalid Plan');
        else if (error instanceof UnsupportedLicenseTypeError)
          metrics.bulletin(errorBulletin).post('Unsupported License Type');
        else
          metrics.bulletin(errorBulletin).post('Collector error');

        throw error;
      }

      const collectEndTime = moment.utc();
      metrics.gauge('usage.collect.duration.millis').set(collectEndTime.diff(collectStartTime));
    }
  });
};

const createCollector = (validator, producer) => monitoredCollector(new Collector(validator, producer));

module.exports = { createCollector };
