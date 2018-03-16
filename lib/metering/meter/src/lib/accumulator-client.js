'use strict';

const httpStatus = require('http-status-codes');
// const util = require('util');
const { extend } = require('underscore');
const edebug = require('abacus-debug')('e-abacus-meter-accumulator-client');
const debug = require('abacus-debug')('abacus-meter-accumulator-client');


const buildUrl = (rootUrl, resourceId) => `${rootUrl}/v1/metering/metered/usage`;
// const errorMessage = `Unable to post usage doc to accumulator. Response: '${res}'`;

// const BUSINESS_ERROR_CODE = httpStatus.UNPROCESSABLE_ENTITY;
const DUPLICATE_MESSAGE_ERROR_CODE = httpStatus.CONFLICT;

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
  constructor(rootUrl, httpClient, auth) {
    this.rootUrl = rootUrl;
    this.httpClient = httpClient;
    this.auth = auth;
  }

  async postUsage(usageDoc) {
    if(!usageDoc)
      return;

    debug('Posting usage to accumulators');
    const res = await this.httpClient.post(
      buildUrl(this.rootUrl), requestOptions(this.auth, usageDoc)
    );
    if (res.statusCode !== httpStatus.CREATED && res.statusCode !== DUPLICATE_MESSAGE_ERROR_CODE) {
      edebug(`Unable to post usage doc to accumulator. Response: '${res}'`);
      throw new Error(res.body);
    }
  }
}

module.exports = AccumulatorClient;
