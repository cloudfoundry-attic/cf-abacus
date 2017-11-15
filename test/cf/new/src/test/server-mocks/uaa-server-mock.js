'use strict';

const httpStatus = require('http-status-codes');
const isEqual = require('underscore').isEqual;

const debug = require('abacus-debug')('uaa-server-mock');
const express = require('abacus-express');

const randomPort = 0;

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

  const returns = [];
  const requests = [];

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
      debug('Called /oauth/token endpoint with query %j and headers: %j', request.query, request.headers);
      const queryScopes = request.query.scope || '';
      requests.push({
        credentials: extractCredentials(request.header('Authorization')),
        scopes: queryScopes ? queryScopes.split(' ') : []
      });

      const responseToken = returns[queryScopes];
      debug('Returning Oauth Token: %s', responseToken);
      response.status(httpStatus.OK).send({
        access_token: responseToken,
        expires_in: 5 * 60
      });
    });

    server = app.listen(randomPort);
    address = server.address();

    return address;
  };

  const stop = (cb) => {
    server.close(cb);
  };

  return {
    start,
    address: () => server.address(),
    tokenService: {
      requestsCount: () => requests.length,
      requests: {
        withScopes: (scopes) => {
          return requests.filter((request) => isEqual(request.scopes, scopes));
        }
      },
      whenScopes: (scopes) => {
        const serializedScopes = scopes.join(' ');
        return {
          return: (returnValue) => {
            returns[serializedScopes] = returnValue;
          }
        };
      }
    },
    stop
  };
};
