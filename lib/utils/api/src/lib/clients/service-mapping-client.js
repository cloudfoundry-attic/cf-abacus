'use strict';


const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');
const { buildPath } = require('../url');
const { APIError } = require('../errors');

const doPost = util.promisify(request.post);
const doPut = util.promisify(request.put);

class ServiceMappingClient {
  constructor(url, authHeaderProvider, skipSslValidation) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
    this.skipSslValidation = skipSslValidation;
  }

  async createServiceMapping(resource, plan, serviceMapping) {
    await this._executeHttpOperation(doPost, resource, plan, serviceMapping);
  }

  async updateServiceMapping(resource, plan, serviceMapping) {
    await this._executeHttpOperation(doPut, resource, plan, serviceMapping);
  }

  async _executeHttpOperation(httpOperation, resource, plan, serviceMapping) {
    const res = await httpOperation(buildPath(
      'v1',
      'provisioning',
      'mappings',
      'services',
      'resource',
      resource,
      'plan',
      plan
    ), {
      baseUrl: this.url,
      rejectUnauthorized: !this.skipSslValidation,
      forever: true,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      },
      json: serviceMapping
    });

    switch (res.statusCode) {
      case httpStatus.OK:
        return;
      default:
        throw new APIError(res.statusCode);
    }
  }
};

module.exports = {
  ServiceMappingClient
};
