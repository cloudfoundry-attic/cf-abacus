'use strict';

const debug = require('abacus-debug')('abacus-service-mapping-server-mock');
const express = require('abacus-express');

const createMockServiceData = require('./mock-service-data');

const randomPort = 0;

const extractOAuthToken = (authHeader) => {
  if (authHeader)
    return authHeader.split(' ')[1];

  return undefined;
};

const storeServiceMappingRequest = (serviceData, request) => {
  serviceData.requests().push({
    token: extractOAuthToken(request.header('Authorization')),
    mapping: {
      resource: request.params.resource,
      plan: request.params.plan,
      serviceMapping: request.body
    }
  });
};

module.exports = () => {
  let server;

  const createServiceMappingServiceData = createMockServiceData();
  const updateServiceMappingServiceData = createMockServiceData();

  const start = (cb) => {
    const app = express();

    app.post('/v1/provisioning/mappings/services/resource/:resource/plan/:plan', (req, res) => {
      debug('Create service mapping called. Params: %j', req.params);
      storeServiceMappingRequest(createServiceMappingServiceData, req);

      const responseCode = createServiceMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });

    app.put('/v1/provisioning/mappings/services/resource/:resource/plan/:plan', (req, res) => {
      debug('Update service mapping called. Params: %j', req.params);
      storeServiceMappingRequest(updateServiceMappingServiceData, req);

      const responseCode = updateServiceMappingServiceData.nextResponse();
      res.status(responseCode).send();
    });

    server = app.listen(randomPort, (err) => {
      if (err) {
        cb(err);
        return;
      }

      debug('Service Mapping Server started on port: %d', server.address().port);
      cb();
    });
  };

  const stop = (cb) => {
    server.close(cb);
  };

  return {
    start,
    url: () => `http://localhost:${server.address().port}`,
    createServiceMappingService: createServiceMappingServiceData,
    updateServiceMappingService: updateServiceMappingServiceData,
    stop
  };
};
