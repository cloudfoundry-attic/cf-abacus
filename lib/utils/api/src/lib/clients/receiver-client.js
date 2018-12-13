'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UnprocessableEntityError,
  APIError
} = require('../errors');

const doPost = util.promisify(request.post);

class ReceiverClient {

  constructor(url, authHeaderProvider, skipSslValidation) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
    this.skipSslValidation = skipSslValidation;
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

  /* eslint-disable complexity */
  async _doPost(path, body, authHeader) {
    const res = await doPost(path, {
      baseUrl: this.url,
      json: body,
      rejectUnauthorized: !this.skipSslValidation,
      forever: false,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      }
    });

    switch (res.statusCode) {
      case httpStatus.CREATED:
        return;
      case httpStatus.BAD_REQUEST:
        throw new BadRequestError();
      case httpStatus.UNAUTHORIZED:
        throw new UnauthorizedError();
      case httpStatus.FORBIDDEN:
        throw new ForbiddenError();
      case httpStatus.CONFLICT:
        throw new ConflictError();
      case httpStatus.UNPROCESSABLE_ENTITY:
        throw new UnprocessableEntityError();
      default:
        throw new APIError(res.statusCode);
    }
  }

};


module.exports = {
  ReceiverClient
};
