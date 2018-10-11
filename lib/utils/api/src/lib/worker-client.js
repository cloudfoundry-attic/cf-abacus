'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { APIError } = require('./errors');

const doGet = util.promisify(request.get);

class WorkerClient {

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
};

module.exports = {
  WorkerClient
};
