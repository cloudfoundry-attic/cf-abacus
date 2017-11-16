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

  const returnStatusCode = {
    always: undefined,
    perRequest: []
  };

  const received = {
    requests: []
  };

  const start = () => {
    app = express();

    const routes = router();

    routes.post('/v1/metering/collected/usage', (req, res) => {
      debug('Abacus collector was called. Usage: %j', req.body);

      received.requests.push({
        token: extractOAuthToken(req.header('Authorization')),
        usage: req.body
      });

      const responseCode = returnStatusCode.always || returnStatusCode.perRequest[received.requests.length - 1];
      let responseBody;
      if (responseCode === httpStatus.CREATED)
        res.header('Location', resourceLocation);

      if (responseCode === httpStatus.CONFLICT)
        responseBody = { error: 'Conflict' };

      debug('Abacus collector response with: %d', responseCode);
      res.status(responseCode).send(responseBody);
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
      request: (n) => received.requests[n],
      requests: (n) => received.requests,
      return: {
        always: (value) => returnStatusCode.always = value,
        firstTime: (value) => returnStatusCode.perRequest[0] = value,
        secondTime: (value) => returnStatusCode.perRequest[1] = value,
        series: (values) => returnStatusCode.perRequest = values
      }
    },
    stop
  };
};
