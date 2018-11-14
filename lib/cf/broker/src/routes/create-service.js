'use strict';

const { extend, isEmpty, pick } = require('underscore');

const async = require('async');
const httpStatus = require('http-status-codes');

const config = require('../config.js');

const sampleMeteringPlan = require('../plans/metering.js');
const samplePricingPlan = require('../plans/pricing.js');
const sampleRatingPlan = require('../plans/rating.js');

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');
const xdebug = require('abacus-debug')('x-abacus-broker');

const sanitize = (exchange) => pick(exchange, 'body', 'headers', 'statusCode');

const getResourceProvider = (plans) => isEmpty(plans) ? undefined : plans[0].resource_provider;

module.exports = (serviceMappingClient, provisioningClient) => {

  const resourceProviderMappingBody = (requestConfig) => ({
    organization_guid: requestConfig.organization_guid,
    space_guid: requestConfig.space_guid,
    service_name: requestConfig.parameters.plans[0].resource_provider
      .service_name,
    service_plan_name: requestConfig.parameters.plans[0].resource_provider
      .service_plan_name
  });

  const createServiceMapping = async(requestConfig, plans, planId) => {
    debug('Creating service mappings');
    const resourceProvider = getResourceProvider(plans);
    if (!resourceProvider)
      return;

    await serviceMappingClient.createServiceMapping(
      requestConfig.instance_id,
      `${config.defaultPlanName}/${planId}/${planId}/${planId}`,
      resourceProviderMappingBody(requestConfig)
    );
  };

  const meteringPlan = (plans, planId) => {
    if(!isEmpty(plans)) {
      debug('Creating custom metering plan');
      return extend({}, plans[0].plan, { plan_id: planId });
    }

    return sampleMeteringPlan(planId);
  };

  const pricingPlan = (plans, planId) => {
    if(isEmpty(plans))
      return samplePricingPlan(planId);

    const metrics = plans[0].plan.metrics;
    return samplePricingPlan(planId, config.buildPricingPlanMetrics(metrics));
  };

  const ratingPlan = (plans, planId) => {
    if(isEmpty(plans))
      return sampleRatingPlan(planId);

    const metrics = plans[0].plan.metrics;
    return sampleRatingPlan(planId, config.buildRatingPlanMetrics(metrics));
  };

  const createPlansTask = (plans, planId, cb) =>{
    async.series([
      async () => await provisioningClient.createMeteringPlan(meteringPlan(plans, planId)),
      async () => await provisioningClient.createPricingPlan(pricingPlan(plans, planId)),
      async () => await provisioningClient.createRatingPlan(ratingPlan(plans, planId))
    ], (err) => {
      if (err) {
        edebug('Error during plans creation %o', err);
        cb(err);
        return;
      }

      cb();
    });
  };

  const createMappingsTask = (instanceId, planId, cb) =>
    async.parallel([
      async () => await provisioningClient.mapMeteringPlan(instanceId, config.defaultPlanName, planId),
      async () => await provisioningClient.mapPricingPlan(instanceId, config.defaultPlanName, planId),
      async () => await provisioningClient.mapRatingPlan(instanceId, config.defaultPlanName, planId)
    ], (err) => {
      if (err) {
        edebug('Error during plan mappings creation %o', err);
        cb(err);
        return;
      }

      cb();
    });

  const createPlans = (requestConfig, cb) => {
    debug('Creating service instance with configuration %o', requestConfig);

    const serviceConfig = requestConfig.parameters;
    if(!config.isServiceConfigValid(serviceConfig)) {
      edebug('Service configuration is not valid, %o', serviceConfig);
      cb(httpStatus.BAD_REQUEST, 'Invalid service configuration.');
      return;
    }

    const instanceId = requestConfig.instance_id;
    const planId = config.generatePlanId(instanceId, instanceId);
    const plans = serviceConfig ? serviceConfig.plans : undefined;

    async.series([
      async () => await createServiceMapping(requestConfig, plans, planId),
      async.apply(createPlansTask, plans, planId),
      async.apply(createMappingsTask, instanceId, planId)
    ], (err) => {
      if (err) {
        edebug('Failed to create service instance %o: %o', requestConfig, err);
        const statusCode = err.statusCode ? err.statusCode : httpStatus.INTERNAL_SERVER_ERROR;
        if (statusCode >= httpStatus.INTERNAL_SERVER_ERROR) {
          cb(httpStatus.INTERNAL_SERVER_ERROR);
          return;
        }
        cb(statusCode, err.message);
        return;
      }

      cb(httpStatus.CREATED);
    });
  };

  const createService = (request, response) => {
    xdebug('Create service request %o', sanitize(request));
    const requestConfig = {
      instance_id: request.params.instance_id,
      service_id: request.body.service_id,
      parameters: request.body.parameters,
      organization_guid: request.body.context && request.body.context.organization_guid,
      space_guid: request.body.context && request.body.context.space_guid
    };

    createPlans(requestConfig, (statusCode, errorMessage) => {
      if (errorMessage)
        response.status(statusCode).send({ description: errorMessage });
      else
        response.status(statusCode).send({
          dashboard_url: config.dashboardUrl(request.params.instance_id)
        });
    });
  };

  return {
    createService,
    createPlans
  };
};
