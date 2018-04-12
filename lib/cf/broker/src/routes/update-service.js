'use strict';

const { extend, first, isEmpty, pick } = require('underscore');

const async = require('async');
const httpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');
const xdebug = require('abacus-debug')('x-abacus-broker');

const request = require('abacus-request');

const config = require('../config.js');
const oauth = require('../auth/oauth.js');
const samplePricingPlan = require('../plans/pricing.js');
const sampleRatingPlan = require('../plans/rating.js');

const sanitize = (exchange) => pick(exchange, 'body', 'headers', 'statusCode');

const getResourceProvider = (plans) => isEmpty(plans) ? undefined : plans[0].resource_provider;

const resourceProviderMappingBody = (requestConfig) => ({
  organization_guid: requestConfig.organization_guid,
  space_guid: requestConfig.space_guid,
  service_name: requestConfig.parameters.plans[0].resource_provider
    .service_name,
  service_plan_name: requestConfig.parameters.plans[0].resource_provider
    .service_plan_name
});

const updateServiceMapping = (requestConfig, plans, planId, cb) => {
  const resourceProvider = getResourceProvider(plans);
  if (resourceProvider) {
    debug('Updating service mapping for plan %s and resource provider %o',
      planId, resourceProvider);

    request.put(':url/v1/provisioning/mappings/services/resource/:resource/plan/:plan', {
      url: config.getMappingApi(),
      resource: requestConfig.instance_id,
      plan: encodeURIComponent([config.defaultPlanName, planId,
        planId, planId].join('/')),
      headers: oauth.authHeader(),
      body: resourceProviderMappingBody(requestConfig)
    }, (err, response) => {
      if (err || ![httpStatus.CREATED, httpStatus.OK].includes(response.statusCode)) {
        const failure = err ? err : sanitize(response);
        edebug('Failed to update service mapping due to %o', failure);
        cb(failure);
        return;
      }

      debug('Service mapping for plan %s updated successfully', planId);
      cb();
    });
  } else
    cb();
};

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

const updatePlans = (requestConfig, cb) => {
  debug('Updating service instance with configuration %o', requestConfig);

  const serviceConfig = requestConfig.parameters;
  if (!serviceConfig) {
    cb(httpStatus.OK);
    return;
  }
  if(!config.isServiceConfigValid(serviceConfig)) {
    cb(httpStatus.BAD_REQUEST, 'Invalid service configuration.');
    return;
  }

  const instanceId = requestConfig.instance_id;
  const planId = config.generatePlanId(instanceId, instanceId);
  const plans = serviceConfig.plans;
  const meteringPlan = first(plans).plan;

  async.series([
    async.apply(updateServiceMapping, requestConfig, plans, planId),
    async.apply(updateMeteringPlan, meteringPlan, planId),
    async.apply(updatePricingPlan, meteringPlan, planId),
    async.apply(updateRatingPlan, meteringPlan, planId)
  ], (err) => {
    if (err) {
      edebug('Failed to update service instance %o: %o', requestConfig, err);
      const statusCode = err.statusCode ? err.statusCode : httpStatus.INTERNAL_SERVER_ERROR;
      if (statusCode >= httpStatus.INTERNAL_SERVER_ERROR) {
        cb(httpStatus.INTERNAL_SERVER_ERROR);
        return;
      }
      cb(statusCode, err.message);
      return;
    }

    cb(httpStatus.OK);
  });
};

const updateService = (request, response) => {
  xdebug('Update service request %o', sanitize(request));
  const requestConfig = {
    instance_id: request.params.instance_id,
    service_id: request.body.service_id,
    parameters: request.body.parameters,
    organization_guid: request.body.context && request.body.context.organization_guid,
    space_guid: request.body.context && request.body.context.space_guid
  };

  updatePlans(requestConfig, (statusCode, errorMessage) => {
    if (errorMessage)
      response.status(statusCode).send({ description: errorMessage });
    else
      response.status(statusCode).send({});
  });
};

module.exports = updateService;
