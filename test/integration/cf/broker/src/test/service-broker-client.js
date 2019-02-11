'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');
const { APIError } = require('abacus-api-clients');

const doPut = util.promisify(request.put);
const doPatch = util.promisify(request.patch);

class ServiceBrokerClient {

  constructor(url, authHeaderProvider) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
  }

  async createServiceInstance(instanceId, serviceInstanceRequest) {
    const res = await this._executeHttpOperation(doPut, instanceId, serviceInstanceRequest);

    switch (res.statusCode) {
      case httpStatus.CREATED:
        return res.body.dashboard_url;
      default:
        throw new APIError(res.statusCode);
    }
  };

  async updateServiceInstance(instanceId, serviceInstanceRequest) {
    const res = await this._executeHttpOperation(doPatch, instanceId, serviceInstanceRequest);

    switch (res.statusCode) {
      case httpStatus.OK:
        return;
      default:
        throw new APIError(res.statusCode);
    }
  };

  async _executeHttpOperation(httpOperation, instanceId, serviceInstanceRequest) {
    return await httpOperation(`/v2/service_instances/${instanceId}`, {
      baseUrl: this.url,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      },
      json: true,
      body: serviceInstanceRequest
    });
  };
};

module.exports = {
  ServiceBrokerClient
};

