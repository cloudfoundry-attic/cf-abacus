'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { APIError } = require('./errors');

const doGet = util.promisify(request.get);

class WorkerClient {

  constructor(url, authHeaderProvider, skipSslValidation) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
    this.skipSslValidation = skipSslValidation;
  }

  async getHealth() {
    const res = await doGet('/healthcheck', {
      baseUrl: this.url,
      json: true,
      rejectUnauthorized: !this.skipSslValidation,
      forever: true,
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
};

module.exports = {
  WorkerClient
};
