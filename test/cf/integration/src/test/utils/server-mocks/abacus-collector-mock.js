'use strict';
const httpStatus = require('http-status-codes');
const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-collector-mock');
const express = require('abacus-express');
const router = require('abacus-router');

const createMockServiceData = require('./mock-service-data');

const randomPort = 0;
const resourceLocation = 'http://location.com';

// OAuth Authorization header format: "Bearer <token-value>"
const extractOAuthToken = (authHeader) => {
  if (authHeader)
    return authHeader.split(' ')[1];

  return undefined;
};

module.exports = () => {
  let app;
  let server;

  const collectUsageServiceData = createMockServiceData();
  const getUsageServiceData = createMockServiceData();

  const start = () => {
    app = express();

    const routes = router();

    routes.post('/v1/metering/collected/usage', (req, res) => {
      debug('[/v1/metering/collected/usage] called. Usage: %j', req.body);

      collectUsageServiceData.requests().push({
        token: extractOAuthToken(req.header('Authorization')),
        usage: req.body
      });

      const responseCode = collectUsageServiceData.nextResponse();

      if (responseCode === httpStatus.CREATED)
        res.header('Location', resourceLocation);

      let responseBody;
      if (responseCode === httpStatus.CONFLICT)
        responseBody = { error: 'Conflict' };

      debug('[/v1/metering/collected/usage] response code: %d', responseCode);
      res.status(responseCode).send(responseBody);
    });


    routes.get('/v1/metering/collected/usage/:usage_id', (req, res) => {
      debug('[v1/metering/collected/usage/%s] was called', req.params.usage_id);

      getUsageServiceData.requests().push({
        token: extractOAuthToken(req.header('Authorization')),
        usageId: req.params.usage_id
      });

      const response = getUsageServiceData.nextResponse();
      debug('[v1/metering/collected/usage/:usage_id] response: %j', response);
      res.status(response.statusCode).send(response.body);
    });

    app.use(router.batch(routes));
    server = app.listen(randomPort);

    return server.address();
  };

  const stop = (cb) => {
    server.close(cb);
  };

  return {
    start,
    address: () => server.address(),
    collectUsageService:
      extend({}, collectUsageServiceData, { resourceLocation }),
    getUsageService: getUsageServiceData,
    stop
  };
};
