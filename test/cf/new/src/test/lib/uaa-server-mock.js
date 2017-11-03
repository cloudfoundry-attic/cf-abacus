'use strict';

const debug = require('abacus-debug')('uaa-server-mock');
const express = require('abacus-express');
const httpStatus = require('http-status-codes');

const randomPort = 0;

const isAbacusCollectorTokenRequested = (request) => {
  return request.query.scope
    && request.query.scope === 'abacus.usage.write abacus.usage.read';
};

const extractCredentials = (authHeader) => {
  const encodedCredentials = authHeader.split(' ')[1];
  const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString();
  const credentialsArray = decodedCredentials.split(':');

  return {
    id: credentialsArray[0],
    secret: credentialsArray[1]
  };
};

module.exports = () => {
  let app;
  let server;

  let abacusCollectorToken;
  let cfAdminToken;

  let receivedCfAdminCredentials;
  let receivedAbacusCollectorCredentials;

  let requestsCount = 0;

  const start = () => {
    app = express();

    let address;
    app.get('/v2/info', (req, res) => {
      debug('Retrieving cf info...');
      res.send({
        token_endpoint: `http://localhost:${address.port}`
      });
    });

    app.post('/oauth/token', (request, response) => {
      debug('Called /oauth/token endpoint with headers: %j', request.headers);

      requestsCount++;
      let responseToken;
      if (isAbacusCollectorTokenRequested(request)) {
        responseToken = abacusCollectorToken;
        receivedAbacusCollectorCredentials = extractCredentials(request.header('Authorization'));
      }
      else {
        responseToken = cfAdminToken;
        receivedCfAdminCredentials = extractCredentials(request.header('Authorization'));
      }

      response.status(httpStatus.OK).send({
        access_token: responseToken,
        expires_in: 5 * 60
      });
    });


    server = app.listen(randomPort);
    address = server.address();

    return address;
  };

  // TODO: review
  // in order to work this must be called after "start"
  const returnAbacusCollectorToken = (token) => {
    abacusCollectorToken = token;
  };

  const returnCfAdminAccessToken = (token) => {
    cfAdminToken = token;
  };

  const stop = (cb) => {
    server.close(cb);
  };

  return {
    start,
    tokenService: {
      return: {
        abacusCollector: returnAbacusCollectorToken,
        cfAdmin: returnCfAdminAccessToken
      },
      receivedCredentials: {
        abacusCollector: () => receivedAbacusCollectorCredentials,
        cfAdmin: () => receivedCfAdminCredentials
      },
      requestsCount: () => requestsCount
    },
    stop
  };
};
