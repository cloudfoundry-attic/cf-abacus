'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { ConflictError, UnprocessableEntityError, APIError } = require('./errors');

const doPost = util.promisify(request.post);

class ReceiverClient {

  constructor(url) {
    this.url = url;
  }

  async startSampling(usage) {
    const res = await doPost('/v1/events/start', {
      baseUrl: this.url,
      json: usage
    });
    switch (res.statusCode) {
      case httpStatus.CREATED:
        return;
      case httpStatus.CONFLICT:
        throw new ConflictError();
      default:
        throw new APIError(`expected status code 201 but was ${res.statusCode}`);
    }
  }

  async stopSampling(usage) {
    const res = await doPost('/v1/events/stop', {
      baseUrl: this.url,
      json: usage
    });

    switch (res.statusCode) {
      case httpStatus.CREATED:
        return;
      case httpStatus.CONFLICT:
        throw new ConflictError();
      case httpStatus.UNPROCESSABLE_ENTITY:
        throw new UnprocessableEntityError();
      default:
        throw new APIError(`expected status code 201 but was ${res.statusCode}`);
    }
  }
};


module.exports = {
  ReceiverClient
};
