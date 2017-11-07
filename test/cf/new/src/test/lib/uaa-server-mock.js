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
    clientId: credentialsArray[0],
    secret: credentialsArray[1]
  };
};

module.exports = () => {
  let app;
  let server;

  let abacusCollectorToken;
  let cfAdminToken;

  const abacusTokenRequests = [];
  const cfAdminTokenRequests = [];

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

      let responseToken;
      if (isAbacusCollectorTokenRequested(request)) {
        abacusTokenRequests.push(extractCredentials(request.header('Authorization')));
        responseToken = abacusCollectorToken;
      }
      else {
        cfAdminTokenRequests.push(extractCredentials(request.header('Authorization')));
        responseToken = cfAdminToken;
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
    address: () => server.address(),
    tokenService: {
      forAbacusCollectorToken: {
        return: {
          always: returnAbacusCollectorToken
        },
        requests: (index) => abacusTokenRequests[index],
        requestsCount: () => abacusTokenRequests.length
      },
      forCfAdminToken: {
        return: {
          always: returnCfAdminAccessToken
        },
        requests: (index) => cfAdminTokenRequests[index],
        requestsCount: () => cfAdminTokenRequests.length
      }
    },
    stop
  };
};
