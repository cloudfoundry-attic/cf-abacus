'use strict';

const util = require('util');
const request = require('request');
const httpStatus = require('http-status-codes');
const { buildPath } = require('../url');
const { APIError, ConflictError, TooManyRequestsError, BadRequestError } = require('../errors');

const doPost = util.promisify(request.post);
const doPut = util.promisify(request.put);

class ProvisioningClient {
  constructor(url, authHeaderProvider, skipSslValidation) {
    this.url = url;
    this.authHeaderProvider = authHeaderProvider;
    this.skipSslValidation = skipSslValidation;
  }

  async mapMeteringPlan(resourceID, planID, meteringPlan) {
    await this._doMapping(buildPath(
      'v1',
      'provisioning',
      'mappings',
      'metering',
      'resources',
      resourceID,
      'plans',
      planID,
      meteringPlan
    ));
  }

  async mapRatingPlan(resourceID, planID, ratingPlan) {
    await this._doMapping(buildPath(
      'v1',
      'provisioning',
      'mappings',
      'rating',
      'resources',
      resourceID,
      'plans',
      planID,
      ratingPlan
    ));
  }

  async mapPricingPlan(resourceID, planID, pricingPlan) {
    await this._doMapping(buildPath(
      'v1',
      'provisioning',
      'mappings',
      'pricing',
      'resources',
      resourceID,
      'plans',
      planID,
      pricingPlan
    ));
  }

  async createMeteringPlan(plan) {
    await this._doCreatePlan('/v1/metering/plans', plan);
  }

  async createRatingPlan(plan) {
    await this._doCreatePlan('/v1/rating/plans', plan);
  }

  async createPricingPlan(plan) {
    await this._doCreatePlan('/v1/pricing/plans', plan);
  }

  async updateMeteringPlan(plan) {
    await this._doUpdatePlan(buildPath(
      'v1',
      'metering',
      'plans',
      plan.plan_id
    ), plan);
  }

  async updateRatingPlan(plan) {
    await this._doUpdatePlan(buildPath(
      'v1',
      'rating',
      'plans',
      plan.plan_id
    ), plan);
  }

  async updatePricingPlan(plan) {
    await this._doUpdatePlan(buildPath(
      'v1',
      'pricing',
      'plans',
      plan.plan_id
    ), plan);
  }

  async _doUpdatePlan(path, plan) {
    const res = await doPut(path, {
      baseUrl: this.url,
      rejectUnauthorized: !this.skipSslValidation,
      forever: true,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      },
      body: plan,
      json: true
    });

    switch (res.statusCode) {
      case httpStatus.OK:
        return;
      case httpStatus.BAD_REQUEST:
        throw new BadRequestError(this._getErrorMessage(res));
      default:
        throw new APIError(res.statusCode);
    }
  }

  async _doCreatePlan(path, plan) {
    const res = await doPost(path, {
      baseUrl: this.url,
      rejectUnauthorized: !this.skipSslValidation,
      forever: true,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      },
      body: plan,
      json: true
    });

    switch (res.statusCode) {
      case httpStatus.CREATED:
        return;
      case httpStatus.BAD_REQUEST:
        throw new BadRequestError(this._getErrorMessage(res));
      default:
        throw new APIError(res.statusCode);
    }
  }

  async _doMapping(path) {
    const res = await doPost(path, {
      baseUrl: this.url,
      rejectUnauthorized: !this.skipSslValidation,
      forever: true,
      headers: {
        authorization: await this.authHeaderProvider.getHeader()
      }
    });

    switch (res.statusCode) {
      case httpStatus.OK:
        return;
      case httpStatus.CONFLICT:
        throw new ConflictError();
      case httpStatus.TOO_MANY_REQUESTS:
        throw new TooManyRequestsError(parseInt(res.headers['retry-after']) || 0);
      default:
        throw new APIError(res.statusCode);
    }
  }

  _getErrorMessage(res) {
    return res.body ? res.body.message : undefined;
  }
};

module.exports = {
  ProvisioningClient
};
