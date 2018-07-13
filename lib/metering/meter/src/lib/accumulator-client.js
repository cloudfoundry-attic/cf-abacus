'use strict';

const { extend } = require('underscore');
const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');

const debug = require('abacus-debug')('abacus-usage-metering-accumulator-client');
const edebug = require('abacus-debug')('e-abacus-usage-metering-accumulator-client');

const duplicateMessageErrorCode = httpStatus.CONFLICT;

const buildUrl = (accumulatorUrl) => {
  return `${accumulatorUrl}/v1/metering/metered/usage`;
};

const requestOptions = (authHeader, usageDoc) => {
  let options = { body: usageDoc };
  if (authHeader)
    extend(options, {
      headers: {
        authorization: authHeader
      }
    });
  return options;
};

const attachProcessedTime = (doc) => extend({}, doc, { processed: moment.now() });

class AccumulatorClient {
  constructor(urlBuilder, httpClient, createAuthHeader) {
    this.createAuthHeader = createAuthHeader;
    this.urlBuilder = urlBuilder;
    this.httpClient = httpClient;
  }

  async postUsage(usageDoc) {
    if (!usageDoc)
      return undefined;

    debug('Posting usage to accumulators');
    const res = await this.httpClient.post(
      buildUrl(await this.urlBuilder.getUri(usageDoc)),
      requestOptions(this.createAuthHeader && await this.createAuthHeader(), usageDoc)
    );

    switch(res.statusCode) {
      case httpStatus.CREATED:
      case duplicateMessageErrorCode:
        if (res.body && res.body.error === 'slack') {
          edebug('Unable to post usage doc to accumulator: out of slack. Resource instance id: %s, Organization id: %s',
            usageDoc.resource_instance_id, usageDoc.organization_id);
          throw extend(new Error(res.body), { isOutOfSlackError: true });
        }
        return attachProcessedTime(usageDoc);

      case httpStatus.UNPROCESSABLE_ENTITY:
        edebug('Unable to post usage doc to accumulator: plan business error. Response headers %j, body: %j',
          res.headers, res.body);
        throw extend(new Error(res.body), { isPlanBusinessError: true });

      default:
        edebug('Unable to post usage doc to accumulator. Response headers %j, body: %j', res.headers, res.body);
        throw new Error(res.body);
    }
  }
}

module.exports = AccumulatorClient;
