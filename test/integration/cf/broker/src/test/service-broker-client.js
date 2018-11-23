'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');
const { APIError } = require('abacus-api');

const doPut = util.promisify(request.put);

class ServiceBrokerClient {

  constructor(url, authHeaderProvider) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
  }

  async createServiceInstance(instanceId, serviceInstanceRequest) {
    const res = await doPut(`/v2/service_instances/${instanceId}`, {
      baseUrl: this.url,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      },
      json: true,
      body: serviceInstanceRequest
    });

    switch (res.statusCode) {
      case httpStatus.CREATED:
        return res.body.dashboard_url;
      default:
        throw new APIError(res.statusCode);
    }
  };
};

module.exports = {
  ServiceBrokerClient
};

