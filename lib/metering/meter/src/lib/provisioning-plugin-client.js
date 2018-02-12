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

const brequest = retry(breaker(batch(request.get)));
const batchedGetRequest = util.promisify(brequest);


const getRequestOptions = (oauthToken) => {
  const options = {
    cache: true
  };

  if (oauthToken)
    extend(options, {
      headers: {
        authorization: `Bearer ${oauthToken()}`
      }
    });

  return options;
};

class ProvisioningPluginClient {

  constructor(rootUrl, oauthToken) {
    if(!rootUrl)
      throw new Error('Root URL is not provided.');

    this.rootUrl = rootUrl;
    this.oauthToken = oauthToken;
  }

  async getResourceType(resourceId) {
    debug('Retrieving resource type for resource id %s', resourceId);

    const res = await batchedGetRequest(`${this.rootUrl}/v1/provisioning/resources/${resourceId}/type`,
      getRequestOptions(this.oauthToken));

    if (res.statusCode !== httpStatus.OK) {
      const errorMessage = `Unable to retrieve resource type for resource id '${resourceId}'. Reponse: '${res}'`;
      edebug(errorMessage);
      debug(errorMessage);
      throw new Error(errorMessage);
    }

    return res.body;
  };
}

module.exports = ProvisioningPluginClient;
