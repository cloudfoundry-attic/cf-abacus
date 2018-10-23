'use strict';

const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const httpStatus = require('http-status-codes');

const { WebAppClient } = require('../lib/webapp-client');
const { APIError } = require('../lib/errors');

describe('Worker Client', () => {
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
    client = new WebAppClient(`http://localhost:${port}`, skipSslValidation);
    healthcheckMiddlewareStub.reset();
  });

  describe('#healthcheck', () => {
    const credentials = {
      username: 'user',
      password: 'pass'
    };

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

      context('when credentials are provided', () => {
        beforeEach(async () => {
          stubResponse(httpStatus.OK, responseBody);
          response = await client.getHealth(credentials);
        });
  
        it('authorization header is received by backend', () => {
          assert.calledOnce(healthcheckMiddlewareStub);
          const [argReq] = healthcheckMiddlewareStub.firstCall.args;
          expect(argReq.headers.authorization).to.equal(`Basic ${Buffer.from('user:pass').toString('base64')}`);
        });
  
        it('response is returned', () => {
          expect(response).to.deep.equal(responseBody);
        });
      });

      context('when credentials are NOT provided', () => {
        beforeEach(async () => {
          stubResponse(httpStatus.OK, responseBody);
          response = await client.getHealth();
        });
  
        it('authorization header is not received by backend', () => {
          assert.calledOnce(healthcheckMiddlewareStub);
          const [argReq] = healthcheckMiddlewareStub.firstCall.args;
          expect(argReq.headers.authorization).to.equal(undefined);
        });
      });

    });

    context('when is not healthy', () => {

      beforeEach(() => {
        stubResponse(httpStatus.INTERNAL_SERVER_ERROR);
      });

      it('raises an error', async () => {
        await expect(client.getHealth(credentials)).to.be.rejectedWith(APIError);
      });

    });

  });

});
