
'use strict';

const httpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-collector-mock');
const express = require('abacus-express');
const router = require('abacus-router');

const randomPort = 0;

// OAuth Authorization header format: "Bearer <token-value>"
const extractOAuthToken = (authHeader) => {
  if (authHeader)
    return authHeader.split(' ')[1];

  return undefined;
};

module.exports = () => {
  let app;
  let server;

  let returnStatusCode;

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

      let responseBody;
      if (returnStatusCode === httpStatus.CREATED)
        res.header('Location', 'something');

      if (returnStatusCode === httpStatus.CONFLICT)
        responseBody = { error: 'something' };

      res.status(returnStatusCode).send(responseBody);
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
    collectUsageService: {
      requests: (n) => received.requests[n],
      requestsCount: () => received.requests.length,
      return: {
        always: (value) => returnStatusCode = value
      }
    },
    stop
  };
};
