'use strict';

const { extend } = require('underscore');
const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { ConflictError, UnprocessableEntityError, APIError } = require('./errors');

const doPost = util.promisify(request.post);

class ReceiverClient {

  constructor(url, authHeader) {
    this.url = url;
    this.authHeader = authHeader;
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
    const res = await doPost(path, extend({}, {
      baseUrl: this.url,
      json: body
    }, this._getHeaders()));

    this._handleResponse(res);
  }

  _getHeaders() {
    if (!this.authHeader) 
      return {};

    return {
      headers: {
        authorization: this.authHeader()
      } 
    };
  }

  _handleResponse(res) {
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
