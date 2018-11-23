'use strict';

const debug = require('abacus-debug')('abacus-provisioning-server-mock');
const express = require('abacus-express');

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

  const start = (cb) => {
    const app = express();
    app.post('/v1/metering/plans', (req, res) => {
      debug('Create metering plan called. Plan: %j', req.body);
      storePlanRequest(createMeteringPlanServiceData, req);

      const responseCode = createMeteringPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    app.post('/v1/rating/plans', (req, res) => {
      debug('Create rating plan called. Plan: %j', req.body);
      storePlanRequest(createRatingPlanServiceData, req);

      const responseCode = createRatingPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    app.post('/v1/pricing/plans', (req, res) => {
      debug('Create pricing plan called. Plan: %j', req.body);
      storePlanRequest(createPricingPlanServiceData, req);

      const responseCode = createPricingPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    app.put('/v1/metering/plans', (req, res) => {
      debug('Update metering plan called. Plan: %j', req.body);
      storePlanRequest(updateMeteringPlanServiceData, req);

      const responseCode = updateMeteringPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    app.put('/v1/rating/plans', (req, res) => {
      debug('Update rating plan called. Plan: %j', req.body);
      storePlanRequest(updateRatingPlanServiceData, req);

      const responseCode = updateRatingPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    app.put('/v1/pricing/plans', (req, res) => {
      debug('Update pricing plan called. Plan: %j', req.body);
      storePlanRequest(updatePricingPlanServiceData, req);

      const responseCode = updatePricingPlanServiceData.nextResponse();
      res.status(responseCode).send();
    });

    app.post('/v1/provisioning/mappings/metering/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create metering mapping called. Params: %j', req.params);
      storeMappingRequest(createMeteringMappingServiceData, req);

      const responseCode = createMeteringMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });
    app.post('/v1/provisioning/mappings/rating/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create rating mapping called. Params: %j', req.params);
      storeMappingRequest(createRatingMappingServiceData, req);

      const responseCode = createRatingMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });
    app.post('/v1/provisioning/mappings/pricing/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create pricing mapping called. Params: %j', req.params);
      storeMappingRequest(createPricingMappingServiceData, req);

      const responseCode = createPricingMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });

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
    stop
  };
};
