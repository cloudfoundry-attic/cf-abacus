'use strict';

const util = require('util');
const request = require('request');
const { extend } = require('underscore');
const httpStatus = extend({}, require('http-status-codes'), {
  UNAVAILABLE_FOR_LEGAL_REASONS: 451
});
const { APIError, UnavailableForLegalReasonsError, TooManyRequestsError } = require('../errors');

const doPost = util.promisify(request.post);

class CollectorClient {
  constructor(url, authHeaderProvider, skipSslValidation) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
    this.skipSslValidation = skipSslValidation;
  }

  async postUsage(usage) {
    const res = await doPost('/v1/metering/collected/usage', {
      baseUrl: this.url,
      json: usage,
      rejectUnauthorized: !this.skipSslValidation,
      forever: true,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      }
    });

    switch (res.statusCode) {
      case httpStatus.ACCEPTED:
        return;
      case httpStatus.UNAVAILABLE_FOR_LEGAL_REASONS:
        throw new UnavailableForLegalReasonsError();
      case httpStatus.TOO_MANY_REQUESTS:
        throw new TooManyRequestsError(parseInt(res.headers['retry-after']) || 0);
      default:
        throw new APIError(`expected status code 202 but was ${res.statusCode}`);
    }
  }
}

module.exports = {
  CollectorClient
};
