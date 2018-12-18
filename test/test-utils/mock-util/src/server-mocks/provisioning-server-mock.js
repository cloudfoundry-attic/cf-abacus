'use strict';

const debug = require('abacus-debug')('abacus-provisioning-server-mock');
const express = require('abacus-express');
const router = require('abacus-router');

const createMockServiceData = require('./mock-service-data');

const randomPort = 0;

const extractOAuthToken = (authHeader) => {
  if (authHeader)
    return authHeader.split(' ')[1];

  return undefined;
};

const storePlanRequest = (serviceData, request) => {
  serviceData.requests().push({
    token: extractOAuthToken(request.header('Authorization')),
    plan: request.body
  });
};

const storeMappingRequest = (serviceData, request) => {
  serviceData.requests().push({
    token: extractOAuthToken(request.header('Authorization')),
    mapping: {
      resourceId: request.params.resourceId,
      planId: request.params.planId,
      plan: request.params.plan
    }
  });
};

module.exports = () => {
  let server;

  const createMeteringPlanServiceData = createMockServiceData();
  const createRatingPlanServiceData = createMockServiceData();
  const createPricingPlanServiceData = createMockServiceData();

  const updateMeteringPlanServiceData = createMockServiceData();
  const updateRatingPlanServiceData = createMockServiceData();
  const updatePricingPlanServiceData = createMockServiceData();

  const createMeteringMappingServiceData = createMockServiceData();
  const createRatingMappingServiceData = createMockServiceData();
  const createPricingMappingServiceData = createMockServiceData();

  const validateResourceInstanceServiceData = createMockServiceData();

  const start = (cb) => {
    const routes = router();

    routes.post('/v1/metering/plans', (req, res) => {
      debug('Create metering plan called. Plan: %j', req.body);
      storePlanRequest(createMeteringPlanServiceData, req);

      const responseCode = createMeteringPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.post('/v1/rating/plans', (req, res) => {
      debug('Create rating plan called. Plan: %j', req.body);
      storePlanRequest(createRatingPlanServiceData, req);

      const responseCode = createRatingPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.post('/v1/pricing/plans', (req, res) => {
      debug('Create pricing plan called. Plan: %j', req.body);
      storePlanRequest(createPricingPlanServiceData, req);

      const responseCode = createPricingPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.put('/v1/metering/plan/:planId', (req, res) => {
      debug('Update metering plan called. Plan: %j', req.body);
      storePlanRequest(updateMeteringPlanServiceData, req);

      const responseCode = updateMeteringPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.put('/v1/rating/plan/:planId', (req, res) => {
      debug('Update rating plan called. Plan: %j', req.body);
      storePlanRequest(updateRatingPlanServiceData, req);

      const responseCode = updateRatingPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.put('/v1/pricing/plan/:planId', (req, res) => {
      debug('Update pricing plan called. Plan: %j', req.body);
      storePlanRequest(updatePricingPlanServiceData, req);

      const responseCode = updatePricingPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.post('/v1/provisioning/mappings/metering/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create metering mapping called. Params: %j', req.params);
      storeMappingRequest(createMeteringMappingServiceData, req);

      const responseCode = createMeteringMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.post('/v1/provisioning/mappings/rating/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create rating mapping called. Params: %j', req.params);
      storeMappingRequest(createRatingMappingServiceData, req);

      const responseCode = createRatingMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.post('/v1/provisioning/mappings/pricing/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create pricing mapping called. Params: %j', req.params);
      storeMappingRequest(createPricingMappingServiceData, req);

      const responseCode = createPricingMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });

    routes.get('/v1/provisioning/organizations/:org_id/spaces/:space_id/consumers/'
  + ':consumer_id/resources/:resource_id/plans/:plan_id/instances/:resource_instance_id/:time', (req, res) => {
      debug('Validate resource instance service called. Params: %j', req.params);
      validateResourceInstanceServiceData.requests().push({
        resourceInstance: {
          organizationId: req.params.org_id,
          spaceId: req.params.space_id,
          consumerId: req.params.consumer_id,
          planId: req.params.plan_id,
          resourceInstanceId: req.params.resource_instance_id,
          time: req.params.time
        },
        token: extractOAuthToken(req.header('Authorization'))
      });

      const response = validateResourceInstanceServiceData.nextResponse();
      res.status(response.statusCode).send(response.body);
    });

    const app = express();
    app.use(routes);
    app.use(router.batch(routes));
    server = app.listen(randomPort, (err) => {
      if (err) {
        cb(err);
        return;
      }

      debug('Provisioning Plugin Server started on port: %d', server.address().port);
      cb();
    });
  };

  const stop = (cb) => {
    server.close(cb);
  };

  return {
    start,
    url: () => `http://localhost:${server.address().port}`,
    createMeteringPlanService: createMeteringPlanServiceData,
    createRatingPlanService: createRatingPlanServiceData,
    createPricingPlanService: createPricingPlanServiceData,
    updateMeteringPlanService: updateMeteringPlanServiceData,
    updateRatingPlanService: updateRatingPlanServiceData,
    updatePricingPlanService: updatePricingPlanServiceData,
    createMeteringMappingService: createMeteringMappingServiceData,
    createRatingMappingService: createRatingMappingServiceData,
    createPricingMappingService: createPricingMappingServiceData,
    validateResourceInstanceService: validateResourceInstanceServiceData,
    stop
  };
};
