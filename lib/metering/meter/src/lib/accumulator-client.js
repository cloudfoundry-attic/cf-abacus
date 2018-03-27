'use strict';

const { extend } = require('underscore');
const uriBuilder = require('./request-routing')(process.env.ACCUMULATOR_APPS);
const httpStatus = require('http-status-codes');
const debug = require('abacus-debug')('abacus-usage-metering-accumulator-client');
const edebug = require('abacus-debug')('e-abacus-usage-metering-accumulator-client');

const duplicateMessageErrorCode = httpStatus.CONFLICT;

const buildUrl = async(rootUrl, usageDoc) => {
  const accumulatorUrl = await uriBuilder(rootUrl, usageDoc);
  return `${accumulatorUrl}/v1/metering/metered/usage`;
};


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
    this.auth = auth;
    this.rootUrl = rootUrl;
    this.httpClient = httpClient;
  }

  async postUsage(usageDoc) {
    if(!usageDoc)
      return;

    debug('Posting usage to accumulators');
    const res = await this.httpClient.post(
      await buildUrl(this.rootUrl, usageDoc), requestOptions(this.auth, usageDoc)
    );
    if (res.statusCode !== httpStatus.CREATED && res.statusCode !== duplicateMessageErrorCode) {
      edebug(`Unable to post usage doc to accumulator. Response: '${res}'`);
      throw new Error(res.body);
    }
  }
}

module.exports = AccumulatorClient;
