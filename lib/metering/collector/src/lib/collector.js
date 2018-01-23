'use strict';

const HttpStatus = require('http-status-codes');

const edebug = require('abacus-debug')('e-abacus-usage-collector');

const dummyLocation = 'https://metering';

const getDocumentLocation = (usageDoc) => {
  // TODO: generate correct location
  return dummyLocation;
};

class Collector {

  constructor(validator, producer) {
    this.validator = validator;
    this.producer = producer;
  };

  async collect(usageDoc, auth) {
    try {
      await this.validator.validate(usageDoc, auth);
    } catch(error) {
      edebug('Usage document validation failed %j', error);
      const statusCode = error.badRequest === true ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;
      return { status: statusCode, body: error.err };
    }

    try {
      await this.producer.send(usageDoc);
    } catch(error) {
      edebug('Usage document enqueue failed %j', error);
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: error };
    }

    return {
      status: HttpStatus.CREATED,
      header: {
        Location: getDocumentLocation(usageDoc)
      }
    };
  };
}

module.exports = Collector;
