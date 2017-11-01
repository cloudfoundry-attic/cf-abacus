
'use strict';

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

  let receivedRequestCount = 0;
  let receivedOAuthToken;

  const start = () => {
    app = express();

    const routes = router();

    routes.post('/v1/metering/collected/usage', (req, res) => {
      console.log('Abacus collector was called. Body: %j', req.body);
      receivedRequestCount++;
      receivedOAuthToken = extractOAuthToken(req.header('Authorization'));
      res.header({ location: 'something' })
        .status(201).send();
    });

    app.use(router.batch(routes));
    server = app.listen(randomPort);

    return server.address();
  };

  const stop = (cb) => {
    server.close(cb);
  };


  const getReceivedOAuthToken = () => {
    return receivedOAuthToken;
  };

  const getReceivedRequetsCount = () => {
    return receivedRequestCount;
  };

  return {
    start,
    getReceivedOAuthToken,
    getReceivedRequetsCount,
    stop
  };
};
