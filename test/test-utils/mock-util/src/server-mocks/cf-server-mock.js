'use strict';

const express = require('express');
const debug = require('abacus-debug')('cf-server-mock');
const randomPort = 0;


module.exports = () => {
  let app;
  let server;
  let additionalRoutes;

  let returnUaaAddress;

  const start = (cb) => {
    app = express();

    if (additionalRoutes)
      app.use(additionalRoutes);

    app.get('/v2/info', (req, res) => {
      debug('Retrieving cf info...');
      res.send({
        token_endpoint: returnUaaAddress
      });
    });

    server = app.listen(randomPort, (err) => {
      if (err) {
        cb(err);
        return;
      }

      debug('Cloud Foundry server mock started on port: %d', server.address().port);
      cb();
    });
  };

  const stop = (cb) => {
    server.close(cb);
  };

  return {
    start,
    additionalRoutes: (routes) => additionalRoutes = routes,
    address: () => server.address(),
    infoService: {
      returnUaaAddress: (value) => returnUaaAddress = value
    },
    stop
  };
};
