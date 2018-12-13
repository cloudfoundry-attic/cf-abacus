'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');
const { buildPath } = require('../url');
const { APIError } = require('../errors');

const doGet = util.promisify(request.get);

class ReportingClient {
  constructor(url, authHeaderProvider, skipSslValidation) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
    this.skipSslValidation = skipSslValidation;
  }

  async getReport(organizationId, timestamp) {
    const path = buildPath(
      'v1',
      'metering',
      'organizations',
      organizationId,
      'aggregated',
      'usage',
      timestamp
    );
    const res = await doGet(path, {
      baseUrl: this.url,
      rejectUnauthorized: !this.skipSslValidation,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      }
    });

    switch (res.statusCode) {
      case httpStatus.OK:
        return res.body;
      default:
        throw new APIError(res.statusCode);
    }
  }
}

module.exports = {
  ReportingClient
};
