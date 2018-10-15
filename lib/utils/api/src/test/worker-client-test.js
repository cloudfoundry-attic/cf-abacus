'use strict';

const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const httpStatus = require('http-status-codes');

const { WorkerClient } = require('../lib/worker-client');
const { APIError } = require('../lib/errors');

describe('Worker Client', () => {
  const skipSslValidation = false;
  const authHeader = 'authorization-header-content';
  let healthcheckMiddlewareStub;
  let server;
  let client;

  before(async () => {
    healthcheckMiddlewareStub = sinon.stub();

    const app = express();
    app.use(bodyParser.json());
    app.get('/v1/healthcheck', healthcheckMiddlewareStub);

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);
  });

  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    const port = server.address().port;
    const authHeaderProviderStub = {
      getHeader: sinon.stub().returns(authHeader)
    };
    client = new WorkerClient(`http://localhost:${port}`, authHeaderProviderStub, skipSslValidation);
  });

  describe('#healthcheck', () => {

    const stubResponse = (statusCode, body) => {
      healthcheckMiddlewareStub.callsFake((req, resp) => {
        resp.status(statusCode).send(body);
      });
    };

    context('when is healthy', () => {
      let response;
      const responseBody = {
        healthy: 'data'
      };

      beforeEach(async () => {
        stubResponse(httpStatus.OK, responseBody);
        response = await client.getHealth();
      });

      it('request is received by receiver', () => {
        assert.calledOnce(healthcheckMiddlewareStub);
        const [argReq] = healthcheckMiddlewareStub.firstCall.args;
        expect(argReq.headers.authorization).to.equal(authHeader);
      });

      it('response is returned', () => {
        expect(response).to.deep.equal(responseBody);
      });

    });

    context('when is not healthy', () => {

      beforeEach(() => {
        stubResponse(httpStatus.INTERNAL_SERVER_ERROR);
      });

      it('raises an error', async () => {
        await expect(client.getHealth()).to.be.rejectedWith(APIError);
      });

    });

  });

});
