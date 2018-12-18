'use strict';

const util = require('util');
const request = require('request');
const { extend } = require('underscore');
const httpStatus = extend({}, require('http-status-codes'), {
  UNAVAILABLE_FOR_LEGAL_REASONS: 451
});
const { APIError, BadRequestError, UnavailableForLegalReasonsError, TooManyRequestsError } = require('../errors');

const doPost = util.promisify(request.post);

/* eslint-disable complexity */
class CollectorClient {
  constructor(url, authPolicy) {
    this.url = url;
    this.authHeaderProvider = authPolicy.authHeaderProvider;
    this.skipSslValidation = authPolicy.skipSslValidation;
  }

  async postUsage(usage) {
    const res = await doPost('/v1/metering/collected/usage', {
      baseUrl: this.url,
      json: usage,
      rejectUnauthorized: !this.skipSslValidation,
      forever: false,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      }
    });

    switch (res.statusCode) {
      case httpStatus.ACCEPTED:
        return;
      case httpStatus.BAD_REQUEST:
        throw new BadRequestError(res.body && res.body.name);
      case httpStatus.UNAVAILABLE_FOR_LEGAL_REASONS:
        throw new UnavailableForLegalReasonsError();
      case httpStatus.TOO_MANY_REQUESTS:
        throw new TooManyRequestsError(parseInt(res.headers['retry-after']) || 0);
      default:
        throw new APIError(res.statusCode);
    }
  }
}

module.exports = {
  CollectorClient
};
