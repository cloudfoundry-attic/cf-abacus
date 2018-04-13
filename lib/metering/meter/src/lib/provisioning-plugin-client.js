'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');
const { extend } = require('underscore');

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');

const debug = require('abacus-debug')('abacus-usage-metering-provisioning-plugin-client');
const edebug = require('abacus-debug')('e-abacus-usage-metering-provisioning-plugin-client');

const brequest = retry(breaker(batch(request)));
const batchedGetRequest = util.promisify(brequest.get);

const buildUrl = (rootUrl, resourceId) => `${rootUrl}/v1/provisioning/resources/${resourceId}/type`;

const getRequestOptions = (authHeader) => {
  const options = {
    cache: true
  };

  if (authHeader)
    extend(options, {
      headers: {
        authorization: authHeader
      }
    });

  return options;
};

class ProvisioningPluginClient {

  constructor(rootUrl, createAuthHeader) {
    if(!rootUrl)
      throw new Error('Root URL is not provided.');

    this.rootUrl = rootUrl;
    this.createAuthHeader = createAuthHeader;
  }

  async getResourceType(resourceId) {
    debug('Retrieving resource type for resource id %s', resourceId);

    const res = await batchedGetRequest(
      buildUrl(this.rootUrl, resourceId),
      getRequestOptions(this.createAuthHeader())
    );

    if (res.statusCode !== httpStatus.OK) {
      const errorMessage = `Unable to retrieve resource type for resource id '${resourceId}'. Response: '${res}'`;
      edebug(errorMessage);
      debug(errorMessage);
      throw new Error(errorMessage);
    }

    return res.body;
  };
}

module.exports = ProvisioningPluginClient;
