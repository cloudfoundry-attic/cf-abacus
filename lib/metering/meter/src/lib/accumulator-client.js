'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');
const { extend } = require('underscore');

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');
const edebug = require('abacus-debug')('e-abacus-meter-accumulator-client');
const debug = require('abacus-debug')('abacus-meter-accumulator-client');

const brequest = retry(breaker(batch(request)));
const batchedPostRequest = util.promisify(brequest.post);

const buildUrl = (rootUrl, resourceId) => `${rootUrl}/v1/metering/metered/usage`;

const BUSINESS_ERROR_CODE = httpStatus.UNPROCESSABLE_ENTITY;

const requestOptions = (auth, usageDoc) => {
  let options = { body: usageDoc };
  if (auth)
    extend(options, {
      headers: {
        authorization: auth
      }
    });
  return options;
};

class AccumulatorClient {
  constructor(rootUrl, auth) {
    if(!rootUrl)
      throw new Error('Root URL is not provided.');

    this.rootUrl = rootUrl;
    this.auth = auth;
  }

  async postUsage(usageDoc) {
    debug('Posting usage to accumulators');

    const res = await batchedPostRequest(
      buildUrl(this.rootUrl), requestOptions(this.auth, usageDoc)
    );

    if (res.statusCode !== httpStatus.CREATED) {
      const errorMessage = `Unable to post usage doc to accumulator. Response: '${res}'`;
      console.log(res);
      edebug(errorMessage);
      debug(errorMessage);
      throw { message: errorMessage, isPlanBusinessError: res.statusCode === BUSINESS_ERROR_CODE };
    }
  }
}

module.exports = AccumulatorClient;
