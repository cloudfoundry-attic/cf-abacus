'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');
const { extend } = require('underscore');

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');
const edebug = require('abacus-debug')('e-provisioning-plugin-client');
const debug = require('abacus-debug')('provisioning-plugin-client');

const brequest = retry(breaker(batch(request.post)));
const batchedPostRequest = util.promisify(brequest);

const buildUrl = (rootUrl, resourceId) => `${rootUrl}/v1/metering/metered/usage`;

const BUSINESS_ERROR_CODE = httpStatus.UNPROCESSABLE_ENTITY;

const requestOptions = (oauthToken, usageDoc) => {
  let options = { body: usageDoc };
  if (oauthToken)
    extend(options, {
      headers: {
        authorization: `Bearer ${oauthToken()}`
      }
    });
  return options;
};

class AccumulatorClient {
  constructor(rootUrl, oauthToken) {
    if(!rootUrl)
      throw new Error('Root URL is not provided.');

    this.rootUrl = rootUrl;
    this.oauthToken = oauthToken;
  }

  async postUsage(usageDoc) {
    debug('Posting usege to accumulators');

    const res = await batchedPostRequest(
      buildUrl(this.rootUrl), requestOptions(this.oauthToken, usageDoc)
    );

    if (res.statusCode !== httpStatus.CREATED) {
      const errorMessage = `Unable to post usage doc to accumulator. Response: '${res}'`;
      edebug(errorMessage);
      debug(errorMessage);
      throw { message: errorMessage, isPlanBusinessError: res.statusCode === BUSINESS_ERROR_CODE };
    }
  }
}

module.exports = AccumulatorClient;
