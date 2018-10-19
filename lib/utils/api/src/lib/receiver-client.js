'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { BadRequestError, ConflictError, UnprocessableEntityError, APIError } = require('./errors');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

class ReceiverClient {

  constructor(url, authHeadersProvider, skipSslValidation) {
    this.url = url;
    this.authHeadersProvider = authHeadersProvider;
    this.skipSslValidation = skipSslValidation;
  }

  async getHealth() {
    const res = await doGet('/healthcheck', {
      baseUrl: this.url,
      json: true,
      rejectUnauthorized: !this.skipSslValidation,
      forever: true,
      headers: {
        authorization: this.authHeadersProvider.getHealthcheckHeader()
      }
    });

    switch (res.statusCode) {
      case httpStatus.OK:
        return res.body;
      default:
        throw new APIError(`expected status code 200 but was ${res.statusCode}`);
    }
  }

  async startSampling(usage) {
    await this._doPost('/v1/events/start', usage, this.authHeadersProvider.getSamplingHeader());
  }

  async stopSampling(usage) {
    await this._doPost('/v1/events/stop', usage, this.authHeadersProvider.getSamplingHeader());
  }

  async createMappings(mapping) {
    await this._doPost('/v1/mappings', mapping, this.authHeadersProvider.getMappingsHeader());
  }

  async _doPost(path, body, authHeader) {
    const res = await doPost(path, {
      baseUrl: this.url,
      json: body,
      headers: {
        authorization: authHeader
      }
    });
    
    this._handlePostResponse(res);
  }

  _handlePostResponse(res) {
    switch (res.statusCode) {
      case httpStatus.CREATED:
        return;
      case httpStatus.BAD_REQUEST:
        throw new BadRequestError();
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
