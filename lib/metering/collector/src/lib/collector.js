'use strict';

const { omit, extend } = require('underscore');
const httpStatus = require('http-status-codes');

const docid = require('abacus-docid');
const moment = require('abacus-moment');
const metrics = require('abacus-metrics');

const debug = require('abacus-debug')('abacus-usage-collector');
const edebug = require('abacus-debug')('e-abacus-usage-collector');

const getLocation = (usageDoc, baseUrl) => {
  return `${baseUrl}/v1/metering/collected/usage/${docid.createMeterId(usageDoc)}`;
};

class CollectError extends Error {
  constructor(message, returnable) {
    super(message);

    this.returnable = returnable;
  }
}

class Collector {
  constructor(validator, producer) {
    this.validator = validator;
    this.producer = producer;
  };

  async validate(usageDoc, authToken) {
    try {
      await this.validator.validate(omit(usageDoc, 'processed_id'), authToken);
    } catch(error) {
      edebug('Usage document validation failed %j', error);
      let statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      if (error.badRequest)
        statusCode = httpStatus.BAD_REQUEST;
      if (error.unsupportedLicense)
        statusCode = 451;

      throw new CollectError('Usage document validation failed', {
        status: statusCode,
        body: extend({}, error, { name: `Validation error: status code ${statusCode}` })
      });
    }
  }

  async send(usageDoc) {
    try {
      debug('Sending to queue %o', usageDoc);
      await this.producer.send(usageDoc);
      debug('Sending to queue finished');
    } catch(error) {
      edebug('Usage document enqueue failed', error);
      throw new CollectError('Usage document enqueue failed', {
        status: httpStatus.INTERNAL_SERVER_ERROR,
        body: extend({}, error, { name: 'Enqueue error' })
      });
    }
  }

  async collect(usageDoc, authToken, baseUrl) {
    try {
      await this.validate(usageDoc, authToken);
      await this.send(usageDoc);
      return {
        status: httpStatus.ACCEPTED,
        header: { Location: getLocation(usageDoc, baseUrl) }
      };
    } catch(e) {
      return e.returnable;
    }
  }
}

const monitoredCollector = (original) => {
  return extend({}, original, {
    collect: async(usageDoc, authToken, baseUrl) => {
      const collectStartTime = moment.utc();

      const collectResult = await original.collect(usageDoc, authToken, baseUrl);

      if(collectResult.status !== httpStatus.ACCEPTED)
        metrics.bulletin('usage.collect.error').post(collectResult.body.name || 'Collect error');
      else
        metrics.counter('usage.collect.producer.send').inc();

      const collectEndTime = moment.utc();
      metrics.gauge('usage.collect.duration.millis').set(collectEndTime.diff(collectStartTime));

      return collectResult;
    }
  });
};

const createCollector = (validator, producer) => monitoredCollector(new Collector(validator, producer));

module.exports = { createCollector };
