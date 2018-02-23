'use strict';

const httpStatus = require('http-status-codes');
const util = require('util');
const { extend } = require('underscore');

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');
const edebug = require('abacus-debug')('e-abacus-provisioning-plugin-client');
const debug = require('abacus-debug')('abacus-provisioning-plugin-client');
// require('request-debug')(request);

const brequest = retry(breaker(batch(request)));
const batchedGetRequest = util.promisify(brequest.get);

const buildUrl = (rootUrl, resourceId) => `${rootUrl}/v1/provisioning/resources/${resourceId}/type`;

const getRequestOptions = (auth) => {
  const options = {
    cache: true
  };

  if (auth)
    extend(options, {
      headers: {
        authorization: auth
      }
    });

  return options;
};

class ProvisioningPluginClient {

  constructor(rootUrl, auth) {
    if(!rootUrl)
      throw new Error('Root URL is not provided.');

    this.rootUrl = rootUrl;
    this.auth = auth;
  }

  async getResourceType(resourceId) {
    debug('Retrieving resource type for resource id %s', resourceId);

    // console.log(this.rootUrl, getRequestOptions(this.auth));
    // console.log(buildUrl(this.rootUrl, resourceId));
    const res = await batchedGetRequest(
      buildUrl(this.rootUrl, resourceId),
      getRequestOptions(this.auth)
    );
    // const res = await batchedGetRequest('https://www.google.bg');
    // console.log(res);

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
