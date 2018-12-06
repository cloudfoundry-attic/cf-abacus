'use strict';

const httpStatus = require('http-status-codes');
const { buildPath } = require('../url');
const { APIError, ConflictError, TooManyRequestsError, BadRequestError } = require('../errors');

class ProvisioningClient {

  constructor(url, authPolicy, requestStrategy) {
    this.url = url;
    this.authHeaderProvider = authPolicy.authHeaderProvider;
    this.skipSslValidation = authPolicy.skipSslValidation;
    this.requestStrategy = requestStrategy;
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
      'plan',
      plan.plan_id
    ), plan);
  }

  async updateRatingPlan(plan) {
    await this._doUpdatePlan(buildPath(
      'v1',
      'rating',
      'plan',
      plan.plan_id
    ), plan);
  }

  async updatePricingPlan(plan) {
    await this._doUpdatePlan(buildPath(
      'v1',
      'pricing',
      'plan',
      plan.plan_id
    ), plan);
  }

  async isResourceInstanceValid(resourceInstance, time) {
    let res;

    try {
      res = await this.requestStrategy.get(
        buildPath(
          'v1',
          'provisioning',
          'organizations',
          resourceInstance.organizationId,
          'spaces',
          resourceInstance.spaceId,
          'consumers',
          resourceInstance.consumerId,
          'resources',
          resourceInstance.resourceId,
          'plans',
          resourceInstance.planId,
          'instances',
          resourceInstance.resourceInstanceId,
          time
        ), {
          baseUrl: this.url,
          rejectUnauthorized: !this.skipSslValidation,
          headers: {
            authorization: await this.authHeaderProvider.getHeader()
          },
          json: true
        });
    } catch (e) {
      throw new APIError(e.statusCode);
    }

    switch (res.statusCode) {
      case httpStatus.OK:
        return true;
      case httpStatus.NOT_FOUND:
        if (res.body && res.body.error)
          return false;

        throw new APIError(res.statusCode);
      default:
        throw new APIError(res.statusCode);
    }
  }

  async _doUpdatePlan(path, plan) {
    let res;

    try {
      res = await this.requestStrategy.put(path, {
        baseUrl: this.url,
        rejectUnauthorized: !this.skipSslValidation,
        headers: {
          authorization: await this.authHeaderProvider.getHeader()
        },
        body: plan,
        json: true
      });
    } catch (e) {
      throw new APIError(e.statusCode);
    }

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
    let res;

    try {
      res = await this.requestStrategy.post(path, {
        baseUrl: this.url,
        rejectUnauthorized: !this.skipSslValidation,
        headers: {
          authorization: await this.authHeaderProvider.getHeader()
        },
        body: plan,
        json: true
      });
    } catch (e) {
      throw new APIError(e.statusCode);
    }

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
    let res;

    try {
      res = await this.requestStrategy.post(path, {
        baseUrl: this.url,
        rejectUnauthorized: !this.skipSslValidation,
        headers: {
          authorization: await this.authHeaderProvider.getHeader()
        }
      });
    } catch (e) {
      throw new APIError(e.statusCode);
    }

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
