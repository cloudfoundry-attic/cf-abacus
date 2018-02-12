'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const _ = require('underscore');
const extend = _.extend;
const first = _.first;

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');

const request = require('abacus-request');

const config = require('../config.js');
const oauth = require('../auth/oauth.js');
const samplePricingPlan = require('../plans/pricing.js');
const sampleRatingPlan = require('../plans/rating.js');


const updatePlan = (planType, planBody, planId, cb) => {
  debug('Updating %s plan with id %s', planType, planId);

  request.put(':provisioning_url/v1/:plan_type/plan/:plan_id', {
    provisioning_url: config.uris().provisioning,
    headers: oauth.authHeader(),
    plan_id: planId,
    body: planBody,
    plan_type: planType
  }, (error, response) => {
    if(error || response.statusCode !== httpStatus.OK) {
      const failure = error ? error :
        extend(new Error(JSON.stringify(response.body)),
          { statusCode: response.statusCode });

      edebug('Error while updating %s plan due to %o', planType, failure);
      cb(failure);
      return;
    }

    cb();
  });
};
const convertBusinessError = (error) => {
  if (error && error.statusCode < httpStatus.INTERNAL_SERVER_ERROR)
    // As we build the request for pricing plan creation,
    // 4xx errors are converted to internal server error
    return extend({}, error, { statusCode: httpStatus.INTERNAL_SERVER_ERROR });

  return error;
};

const updateMeteringPlan = (plan, planId, cb) => {
  const meteringPlan = extend({}, plan, { plan_id: planId });
  updatePlan('metering', meteringPlan, planId, cb);
};

const updatePricingPlan = (meteringPlan, planId, cb) => {
  const pricingPlan = samplePricingPlan(planId,
    config.buildPricingPlanMetrics(meteringPlan.metrics));

  updatePlan('pricing', pricingPlan, planId, (error) =>
    cb(convertBusinessError(error)));
};

const updateRatingPlan = (meteringPlan, planId, cb) => {
  const ratingPlan = sampleRatingPlan(planId,
    config.buildRatingPlanMetrics(meteringPlan.metrics));

  updatePlan('rating', ratingPlan, planId,
    (error) => cb(convertBusinessError(error)));
};

const updatePlans = (req, res) => {
  debug('Updating service instance %j, %j', req.params, req.body);
  const parameters = req.body.parameters;

  if (!parameters) {
    res.status(httpStatus.OK).send({});
    return;
  }

  if(!config.isServiceConfigValid(parameters)) {
    res.status(httpStatus.BAD_REQUEST).send({
      description: 'Invalid service configuration.'
    });
    return;
  }

  const instanceId = req.params.instance_id;
  const planId = config.generatePlanId(instanceId, instanceId);
  const meteringPlan = first(parameters.plans).plan;

  async.series([
    async.apply(updateMeteringPlan, meteringPlan, planId),
    async.apply(updatePricingPlan, meteringPlan, planId),
    async.apply(updateRatingPlan, meteringPlan, planId)
  ], (error) => {
    if (error) {
      edebug('Failed to update plans %o', error);
      if (error.statusCode >= httpStatus.INTERNAL_SERVER_ERROR) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).send({});
        return;
      }
      res.status(error.statusCode).send({ description: error.message });
      return;
    }

    res.status(httpStatus.OK).send({});
  });
};

module.exports = updatePlans;
