'use strict';

const { extend } = require('underscore');
const httpStatus = require('http-status-codes');
const debug = require('abacus-debug')('abacus-meter-accumulator-client');
const edebug = require('abacus-debug')('e-abacus-meter-accumulator-client');

const duplicateMessageErrorCode = httpStatus.CONFLICT;

const buildUrl = (rootUrl, resourceId) => `${rootUrl}/v1/metering/metered/usage`;

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
    if (res.statusCode !== httpStatus.CREATED && res.statusCode !== duplicateMessageErrorCode) {
      edebug(`Unable to post usage doc to accumulator. Response: '${res}'`);
      throw new Error(res.body);
    }
  }
}

module.exports = AccumulatorClient;
