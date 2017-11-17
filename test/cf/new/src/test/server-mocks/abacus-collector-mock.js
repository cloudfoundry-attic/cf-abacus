'use strict';

const httpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-collector-mock');
const express = require('abacus-express');
const router = require('abacus-router');

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

  const collectUsageServiceData = {
    requests: [],
    returnStatusCode: {
      always: undefined,
      perRequest: []
    }
  };

  const getUsageServiceData = {
    requests: [],
    return: {
      always: undefined,
      perRequest: []
    }
  };

  const start = () => {
    app = express();

    const routes = router();

    routes.post('/v1/metering/collected/usage', (req, res) => {
      debug('[/v1/metering/collected/usage] called. Usage: %j', req.body);

      collectUsageServiceData.requests.push({
        token: extractOAuthToken(req.header('Authorization')),
        usage: req.body
      });

      const responseCode = collectUsageServiceData.returnStatusCode.always
        || collectUsageServiceData.returnStatusCode.perRequest[collectUsageServiceData.requests.length - 1];

      let responseBody;
      if (responseCode === httpStatus.CREATED)
        res.header('Location', resourceLocation);

      if (responseCode === httpStatus.CONFLICT)
        responseBody = { error: 'Conflict' };

      debug('[/v1/metering/collected/usage] response code: %d', responseCode);
      res.status(responseCode).send(responseBody);
    });


    routes.get('/v1/metering/collected/usage/:usage_id', (req, res) => {
      debug('[v1/metering/collected/usage/:usage_id] called - usage_id: %s', req.params.usage_id);

      getUsageServiceData.requests.push({
        token: extractOAuthToken(req.header('Authorization')),
        usageId: req.params.usage_id
      });

      const response = getUsageServiceData.return.always
        || getUsageServiceData.return.perRequest[getUsageServiceData.requests.length - 1];
      debug('[v1/metering/collected/usage/:usage_id] response: %j', response);
      res.status(response.code).send(response.body);
    });

    app.use(router.batch(routes));
    app.use(routes);
    server = app.listen(randomPort);

    return server.address();
  };

  const stop = (cb) => {
    server.close(cb);
  };

  return {
    start,
    address: () => server.address(),
    collectUsageService: {
      resourceLocation,
      request: (n) => collectUsageServiceData.requests[n],
      requests: (n) => collectUsageServiceData.requests,
      return: {
        always: (value) => collectUsageServiceData.returnStatusCode.always = value,
        firstTime: (value) => collectUsageServiceData.returnStatusCode.perRequest[0] = value,
        secondTime: (value) => collectUsageServiceData.returnStatusCode.perRequest[1] = value,
        series: (values) => collectUsageServiceData.returnStatusCode.perRequest = values
      }
    },
    getUsageService: {
      resourceLocation,
      request: (n) => getUsageServiceData.requests[n],
      requests: (n) => getUsageServiceData.requests,
      return: {
        always: (value) => getUsageServiceData.return.always = value,
        firstTime: (value) => getUsageServiceData.return.perRequest[0] = value,
        secondTime: (value) => getUsageServiceData.return.perRequest[1] = value,
        series: (values) => getUsageServiceData.return.perRequest = values
      }
    },
    stop
  };
};
