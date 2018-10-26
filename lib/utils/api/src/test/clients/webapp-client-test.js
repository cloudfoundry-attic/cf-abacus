'use strict';

const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const httpStatus = require('http-status-codes');

const { WebAppClient } = require('../../lib/clients/webapp-client');
const { UnauthorizedError, APIError } = require('../../lib/errors');

describe('Worker Client', () => {
  const authHeader = 'Basic abc:123';
  const skipSslValidation = false;
  let healthcheckMiddlewareStub;
  let server;
  let client;

  before(async () => {
    healthcheckMiddlewareStub = sinon.stub();

    const app = express();
    app.use(bodyParser.json());
    app.get('/healthcheck', healthcheckMiddlewareStub);

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);
  });

  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    const port = server.address().port;
    const authHeaderProvider = {
      getHeader: sinon.stub().callsFake(async () => authHeader)
    };
    client = new WebAppClient(`http://localhost:${port}`, authHeaderProvider, skipSslValidation);
    healthcheckMiddlewareStub.reset();
  });

  describe('#getHealth', () => {
    const credentials = {
      username: 'user',
      password: 'pass'
    };

    const stubResponse = (statusCode, body) => {
      healthcheckMiddlewareStub.callsFake((req, resp) => {
        resp.status(statusCode).send(body);
      });
    };

    context('when health is requested', () => {
      let response;
      const responseBody = {
        healthy: 'data'
      };

      beforeEach(async () => {
        stubResponse(httpStatus.OK, responseBody);
        response = await client.getHealth(credentials);
      });

      it('authorization header is received by backend', () => {
        assert.calledOnce(healthcheckMiddlewareStub);
        const [argReq] = healthcheckMiddlewareStub.firstCall.args;
        expect(argReq.headers.authorization).to.equal(authHeader);
      });

      it('response is returned', () => {
        expect(response).to.deep.equal(responseBody);
      });
    });

    context('when an "unauthorized" status code is returned', () => {
      beforeEach(() => {
        stubResponse(httpStatus.UNAUTHORIZED);
      });

      it('raises an error', async () => {
        await expect(client.getHealth(credentials)).to.be.rejectedWith(UnauthorizedError);
      });
    });

    context('when an unknown error occurs', () => {
      beforeEach(() => {
        stubResponse(httpStatus.INTERNAL_SERVER_ERROR);
      });

      it('raises an error', async () => {
        await expect(client.getHealth(credentials)).to.be.rejectedWith(APIError);
      });
    });

  });

});
