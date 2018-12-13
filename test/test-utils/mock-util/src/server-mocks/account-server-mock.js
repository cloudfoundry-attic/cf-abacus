'use strict';

const debug = require('abacus-debug')('account-server-mock');
const express = require('abacus-express');
const router = require('abacus-router');

const createMockServiceData = require('./mock-service-data');

const randomPort = 0;

const extractOAuthToken = (authHeader) => {
  if (authHeader)
    return authHeader.split(' ')[1];

  return undefined;
};

module.exports = () => {
  let server;

  const accountServiceData = createMockServiceData();

  const start = (cb) => {
    const routes = router();

    routes.get('/v1/organizations/:org_id/account/:time', (req, res) => {
      debug('Get account sevice called. Params: %j', req.params);
      accountServiceData.requests().push({
        token: extractOAuthToken(req.header('Authorization')),
        organizationId: req.param.org_id,
        time: req.params.time
      });
      const responseCode = accountServiceData.nextResponse();
      res.status(responseCode).send();
    });

    const app = express();
    app.use(routes);
    app.use(router.batch(routes));

    server = app.listen(randomPort, (err) => {
      if (err) {
        cb(err);
        return;
      }

      debug('Account Server started on port: %d', server.address().port);
      cb();
    });
  };

  const stop = (cb) => {
    server.close(cb);
  };

  return {
    start,
    url: () => `http://localhost:${server.address().port}`,
    getAccountService: accountServiceData,
    stop
  };
};
