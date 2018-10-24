'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');

const { APIError, UnauthorizedError } = require('./errors');

const doGet = util.promisify(request.get);

class WebAppClient {

  constructor(url, skipSslValidation) {
    this.url = url;
    this.skipSslValidation = skipSslValidation;
  }

  async getHealth(credentials) {
    const res = await doGet('/healthcheck', {
      baseUrl: this.url,
      json: true,
      rejectUnauthorized: !this.skipSslValidation,
      forever: true,
      headers: {
        authorization: this._getAuthorizationHeader(credentials)
      }
    });

    switch (res.statusCode) {
      case httpStatus.OK:
        return res.body;
      case httpStatus.UNAUTHORIZED:
        throw new UnauthorizedError();
      default:
        throw new APIError(`expected status code 200 but was ${res.statusCode}`);
    }
  }

  _getAuthorizationHeader(credentials) {
    if (!credentials)
      return undefined;
    
    return `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
  }
};

module.exports = {
  WebAppClient
};
