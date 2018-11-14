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

  const createServiceMapping = (requestConfig, plans, planId, cb) => {
    const resourceProvider = getResourceProvider(plans);
    if (!resourceProvider) {
      cb();
      return;
    }

    serviceMappingClient.createServiceMapping(
      requestConfig.instance_id,
      `${config.defaultPlanName}/${planId}/${planId}/${planId}`,
      resourceProviderMappingBody(requestConfig)
    ).then(() => {
      debug('Service mapping for plan %s created successfully', planId);
      cb();
    }).catch((err) => {
      const failure = err ? err : sanitize(response);
      edebug('Failed to create service mapping due to %o', failure);
      cb(failure);
    });
  };

  const createMeteringPlan = (plans, planId, cb) => {
    let meteringPlan = sampleMeteringPlan(planId);

    if(!isEmpty(plans)) {
      debug('Creating custom metering plan');
      meteringPlan = extend({}, plans[0].plan, { plan_id: planId });
    }

    provisioningClient.createMeteringPlan(meteringPlan)
      .then(() => {
        debug('Created metering plan with id %s', planId);
        cb(undefined, plans, planId);
      })
      .catch((err) => {
        if (err || response.statusCode !== httpStatus.CREATED) {
          const failure = err ? err : sanitize(response);
          edebug('Failed to create metering plan with id %s due to %o', planId, failure);
          cb(failure);
        }
      });
  };

  const createPricingPlan = (plans, planId, cb) => {
    let pricingPlan;

    if(isEmpty(plans))
      pricingPlan = samplePricingPlan(planId);
    else {
      const metrics = plans[0].plan.metrics;
      pricingPlan = samplePricingPlan(planId, config.buildPricingPlanMetrics(metrics));
    }

    provisioningClient.createPricingPlan(pricingPlan)
      .then(() => {
        debug('Created pricing plan with id %s', planId);
        cb(undefined, plans, planId);
      })
      .catch((err) => {
        if (err || response.statusCode !== httpStatus.CREATED) {
          const failure = err ? err : sanitize(response);
          edebug('Failed to create pricing plan with id %s due to %o', planId, failure);
          cb(failure);
        }
      });
  };

  const createRatingPlan = (plans, planId, cb) => {
    let ratingPlan;

    if(isEmpty(plans))
      ratingPlan = sampleRatingPlan(planId);
    else {
      const metrics = plans[0].plan.metrics;
      ratingPlan = sampleRatingPlan(planId, config.buildRatingPlanMetrics(metrics));
    }

    provisioningClient.createRatingPlan(ratingPlan)
      .then(() => {
        debug('Created rating plan with id %s', planId);
        cb(undefined, plans, planId);
      })
      .catch((err) => {
        if (err || response.statusCode !== httpStatus.CREATED) {
          const failure = err ? err : sanitize(response);
          edebug('Failed to create rating plan with id %s due to %o', planId, failure);
          cb(failure);
        }
      });
  };

  const createMeteringPlanMapping = (instanceId, planId, cb) => {

    provisioningClient.mapMeteringPlan(instanceId, config.defaultPlanName, planId)
      .then(() => {
        debug('Created metering mapping with id %s', planId);
        cb();
      })
      .catch((err) => {
        if (err || response.statusCode !== httpStatus.OK) {
          const failure = err ? err : sanitize(response);
          edebug('Failed to create metering mapping with id %s due to %o', planId, failure);
          cb(failure);
        }
      });
  };

  const createPricingPlanMapping = (instanceId, planId, cb) => {

    provisioningClient.mapPricingPlan(instanceId, config.defaultPlanName, planId)
      .then(() => {
        debug('Created pricing mapping with id %s', planId);
        cb();
      })
      .catch((err) => {
        if (err || response.statusCode !== httpStatus.OK) {
          const failure = err ? err : sanitize(response);
          edebug('Failed to create pricing mapping with id %s due to %o', planId, failure);
          cb(failure);
        }
      });

  };

  const createRatingPlanMapping = (instanceId, planId, cb) => {

    provisioningClient.mapRatingPlan(instanceId, config.defaultPlanName, planId)
      .then(() => {
        debug('Created rating mapping with id %s', planId);
        cb();
      })
      .catch((err) => {
        if (err || response.statusCode !== httpStatus.OK) {
          const failure = err ? err : sanitize(response);
          edebug('Failed to create rating mapping with id %s due to %o', planId, failure);
          cb(failure);
        }
      });
  };

  const createPlansTask = (plans, planId, cb) =>
    async.waterfall([
      async.apply(createMeteringPlan, plans, planId),
      createPricingPlan,
      createRatingPlan], (err) => {
      if (err) {
        edebug('Error during plans creation %o', err);
        cb(err);
        return;
      }

      cb();
    });

  const createMappingsTask = (instanceId, planId, cb) =>
    async.parallel([
      async.apply(createMeteringPlanMapping, instanceId, planId),
      async.apply(createPricingPlanMapping, instanceId, planId),
      async.apply(createRatingPlanMapping, instanceId, planId)
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
      async.apply(createServiceMapping, requestConfig, plans, planId),
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
