
'use strict';

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
      res.header('Location', 'something')
        .status(201).send();
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
    collectUsageService: {
      requests: (n) => received.requests[n],
      requestsCount: () => received.requests.length
    },
    stop
  };
};
