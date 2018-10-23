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

const storeRequest = (serviceData, request) => {
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

  const meteringMappingServiceData = createMockServiceData();
  const ratingMappingServiceData = createMockServiceData();
  const pricingMappingServiceData = createMockServiceData();

  const start = (cb) => {
    const app = express();
    app.post('/v1/provisioning/mappings/metering/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create metering mapping called. Params: %j', req.params);
      storeRequest(meteringMappingServiceData, req);

      const responseCode = meteringMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });
    app.post('/v1/provisioning/mappings/rating/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create rating mapping called. Params: %j', req.params);
      storeRequest(ratingMappingServiceData, req);

      const responseCode = ratingMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });
    app.post('/v1/provisioning/mappings/pricing/resources/:resourceId/plans/:planId/:plan', (req, res) => {
      debug('Create pricing mapping called. Params: %j', req.params);
      storeRequest(pricingMappingServiceData, req);

      const responseCode = pricingMappingServiceData.nextResponse();
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
    createMeteringMappingService: meteringMappingServiceData,
    createRatingMappingService: ratingMappingServiceData,
    createPricingMappingService: pricingMappingServiceData,
    stop
  };
};
