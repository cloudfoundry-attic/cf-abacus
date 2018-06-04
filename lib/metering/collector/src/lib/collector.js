'use strict';

const util = require('util');

const { omit } = require('underscore');
const HttpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-usage-collector');
const edebug = require('abacus-debug')('e-abacus-usage-collector');

// Not supported account license types
const unsupportedLicenses =
  process.env.UNSUPPORTED_LICENSES ? process.env.UNSUPPORTED_LICENSES.split(',') : [];

const getLocation = (usageDoc, baseUrl) => {
  const key = util.format(
    '%s/%s/%s/%s/%s/%s',
    usageDoc.organization_id,
    usageDoc.space_id,
    usageDoc.consumer_id,
    usageDoc.resource_id,
    usageDoc.plan_id,
    usageDoc.resource_instance_id
  );
  return `${baseUrl}/v1/metering/collected/usage/t/${usageDoc.processed_id}/k/${key}`;
};

class Collector {

  constructor(validator, producer) {
    this.validator = validator;
    this.producer = producer;
  };

  async collect(usageDoc, authToken, baseUrl) {
    try {
      await this.validator.validate(omit(usageDoc, 'processed_id'), authToken, unsupportedLicenses);
    } catch(error) {
      edebug('Usage document validation failed %j', error);
      const statusCode = error.badRequest === true ? HttpStatus.BAD_REQUEST :
        error.unsupportedLicense ? 451 :
          HttpStatus.INTERNAL_SERVER_ERROR;
      return {
        status: statusCode,
        body: error.err
      };
    }

    try {
      debug('Sending to queue %o', usageDoc);
      await this.producer.send(usageDoc);
      debug('Sending to queue finished');
    } catch(error) {
      edebug('Usage document enqueue failed', error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: error
      };
    }

    return {
      status: HttpStatus.CREATED,
      header: { Location: getLocation(usageDoc, baseUrl) }
    };
  };
}

module.exports = Collector;
