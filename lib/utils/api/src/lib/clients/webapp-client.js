'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { APIError, UnauthorizedError } = require('../errors');

const doGet = util.promisify(request.get);

class WebAppClient {

  constructor(url, authPolicy) {
    this.url = url;
    this.authHeaderProvider = authPolicy.authHeaderProvider;
    this.skipSslValidation = authPolicy.skipSslValidation;
  }

  async getHealth() {
    const res = await doGet('/healthcheck', {
      baseUrl: this.url,
      json: true,
      rejectUnauthorized: !this.skipSslValidation,
      forever: false,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      }
    });

    switch (res.statusCode) {
      case httpStatus.OK:
        return res.body;
      case httpStatus.UNAUTHORIZED:
        throw new UnauthorizedError();
      default:
        throw new APIError(res.statusCode);
    }
  }

};

module.exports = {
  WebAppClient
};
