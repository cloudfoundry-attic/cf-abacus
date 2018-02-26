'use strict';

const _ = require('underscore');
const extend = _.extend;
const isEmpty = _.isEmpty;
const pick = _.pick;

const async = require('async');
const httpStatus = require('http-status-codes');

const config = require('../config.js');
const oauth = require('../auth/oauth.js');

const sampleMeteringPlan = require('../plans/metering.js');
const samplePricingPlan = require('../plans/pricing.js');
const sampleRatingPlan = require('../plans/rating.js');

const abacusRequest = require('abacus-request');
const retry = require('abacus-retry');
const throttle = require('abacus-throttle');
const breaker = require('abacus-breaker');

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');
const xdebug = require('abacus-debug')('x-abacus-broker');

const throttleLimit = process.env.THROTTLE ? parseInt(process.env.THROTTLE) : 100;

// if a batch is throttled, then throttle limits the number of calls made to
// the batch function limiting the number of batches. In order to avoid that
// all the batch functions when throttled should have a throttle value that is
// multiplied by the batch.
const request = throttle(retry(breaker(abacusRequest)), throttleLimit);

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

const createServiceMapping = (requestConfig, plans, planId, cb) => {
  const resourceProvider = getResourceProvider(plans);
  if (resourceProvider) {
    debug('Creating service mapping for plan %s and resource provider %o',
      planId, resourceProvider);

    request.post(':url/v1/provisioning/mappings/services/resource/:resource/plan/:plan', {
      url: config.getMappingApi(),
      resource: requestConfig.instance_id,
      plan: encodeURIComponent([config.defaultPlanName, planId,
        planId, planId].join('/')),
      headers: oauth.authHeader(),
      body: resourceProviderMappingBody(requestConfig)
    }, (err, response) => {
      if (err ||
        ![httpStatus.CREATED, httpStatus.OK].includes(response.statusCode)) {
        const failure = err ? err : sanitize(response);
        edebug('Failed to create service mapping due to %o', failure);
        cb(failure);
        return;
      }

      debug('Service mapping for plan %s created successfully', planId);
      cb();
    });
  } else
    cb();
};

const createPlan = (resourceType, planBody, planId, cb) => {
  request.post(':provisioning_url/v1/:resource_type/plans', {
    provisioning_url: config.uris().provisioning,
    resource_type: resourceType,
    headers: oauth.authHeader(),
    body: planBody
  }, (err, response) => {
    if (err || response.statusCode !== httpStatus.CREATED) {
      const failure = err ? err : sanitize(response);
      edebug('Failed to create %s plan with id %s due to %o',
        resourceType, planId, failure);
      cb(failure);
      return;
    }

    debug('Created %s plan with id %s', resourceType, planId);
    cb(undefined, planId);
  });
};

const createPlanMapping = (resourceType, planId, instanceId, cb) => {
  request.post(':provisioning_url/v1/provisioning/mappings/:resource_type' +
    '/resources/:resource_id/plans/:plan_name/:plan_id', {
    provisioning_url: config.uris().provisioning,
    resource_type: resourceType,
    resource_id: instanceId,
    plan_id: planId,
    plan_name: config.defaultPlanName,
    headers: oauth.authHeader()
  }, (err, response) => {
    if (err || response.statusCode !== httpStatus.OK) {
      const failure = err ? err : sanitize(response);
      edebug('Failed to create %s mapping with id %s due to %o',
        resourceType, planId, failure);
      cb(failure);
      return;
    }

    debug('Created %s mapping with id %s', resourceType, planId);
    cb();
  });
};

const createMeteringPlan = (plans, planId, cb) => {
  let meteringPlan = sampleMeteringPlan(planId);

  if(!isEmpty(plans)) {
    debug('Creating custom metering plan');
    meteringPlan = extend({}, plans[0].plan, { plan_id: planId });
  }

  createPlan('metering', meteringPlan, planId, (err, planId) => cb(err,
    plans, planId));
};

const createPricingPlan = (plans, planId, cb) => {
  let pricingPlan;

  if(isEmpty(plans))
    pricingPlan = samplePricingPlan(planId);
  else {
    const metrics = plans[0].plan.metrics;
    pricingPlan = samplePricingPlan(planId, config.buildPricingPlanMetrics(metrics));
  }

  createPlan('pricing', pricingPlan, planId, (err, planId) => cb(err, plans, planId));
};

const createRatingPlan = (plans, planId, cb) => {
  let ratingPlan;

  if(isEmpty(plans))
    ratingPlan = sampleRatingPlan(planId);
  else {
    const metrics = plans[0].plan.metrics;
    ratingPlan = sampleRatingPlan(planId, config.buildRatingPlanMetrics(metrics));
  }

  createPlan('rating', ratingPlan, planId, (err, planId) => cb(err, plans, planId));
};

const createMeteringPlanMapping = (instanceId, planId, cb) => createPlanMapping('metering', planId, instanceId, cb);

const createPricingPlanMapping = (instanceId, planId, cb) => createPlanMapping('pricing', planId, instanceId, cb);

const createRatingPlanMapping = (instanceId, planId, cb) => createPlanMapping('rating', planId, instanceId, cb);

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
      edebug('Error during service instance creation %o', err);
      cb(httpStatus.INTERNAL_SERVER_ERROR);
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
    organization_guid: request.body.organization_guid,
    space_guid: request.body.space_guid
  };

  createPlans(requestConfig, (statusCode, errorMessage) => {
    if (errorMessage)
      response.status(statusCode).send({
        description: errorMessage
      });
    else
      response.status(statusCode).send({
        dashboard_url: config.dashboardUrl(request.params.instance_id)
      });
  });
};

module.exports = createService;
module.exports.createPlans = createPlans;
