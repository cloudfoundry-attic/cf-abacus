'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { BadRequestError, ConflictError, UnprocessableEntityError, APIError } = require('./errors');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

class ReceiverClient {

  constructor(url, authHeaderProvider) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
  }

  async getHealth() {
    const res = await doGet('/v1/healthcheck', {
      baseUrl: this.url,
      json: true,
      headers: {
        authorization: this.authHeaderProvider.getHeader()
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
    await this._doPost('/v1/events/start', usage);
  }

  async stopSampling(usage) {
    await this._doPost('/v1/events/stop', usage);
  }

  async createMappings(mapping) {
    await this._doPost('/v1/mappings', mapping);
  }

  async _doPost(path, body) {
    const res = await doPost(path, {
      baseUrl: this.url,
      json: body,
      headers: {
        authorization: this.authHeaderProvider.getHeader()
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
