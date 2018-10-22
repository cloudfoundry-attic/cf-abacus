'use strict';

const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const httpStatus = require('http-status-codes');

const { ReceiverClient } = require('../lib/receiver-client');

const { BadRequestError, ConflictError, UnprocessableEntityError, APIError } = require('../lib/errors');

describe('Receiver Client', () => {
  const skipSslValidation = false;
  const healthcheckAuthHeader = 'healthcheck-authorization-header-content';
  const samplingAuthHeader = 'sampling-authorization-header-content';
  const mappingsAuthHeader = 'mappings-authorization-header-content';
  let healthcheckMiddlewareStub;
  let startMiddlewareStub;
  let stopMiddlewareStub;
  let mappingsMiddlewareStub;
  let server;
  let client;

  before(async () => {
    healthcheckMiddlewareStub = sinon.stub();
    startMiddlewareStub = sinon.stub();
    stopMiddlewareStub = sinon.stub();
    mappingsMiddlewareStub = sinon.stub();

    const app = express();
    app.use(bodyParser.json());
    app.get('/healthcheck', healthcheckMiddlewareStub);
    app.post('/v1/events/start', startMiddlewareStub);
    app.post('/v1/events/stop', stopMiddlewareStub);
    app.post('/v1/mappings', mappingsMiddlewareStub);

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
      getHealthcheckHeader: sinon.stub().returns(healthcheckAuthHeader),
      getSamplingHeader: sinon.stub().returns(samplingAuthHeader),
      getMappingsHeader: sinon.stub().returns(mappingsAuthHeader)
    };
    client = new ReceiverClient(`http://localhost:${port}`, authHeaderProviderStub, skipSslValidation);
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
        expect(argReq.headers.authorization).to.equal(healthcheckAuthHeader);
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

  describe('#startSampling', () => {
    const usage = {
      data: 'some-data'
    };

    const stubStatusCode = (statusCode) => {
      startMiddlewareStub.callsFake((req, resp) => {
        resp.status(statusCode).send();
      });
    };

    context('when samping is successfully started', () => {
      beforeEach(() => {
        stubStatusCode(httpStatus.CREATED);
      });

      it('usage is received by receiver', async () => {
        await client.startSampling(usage);

        assert.calledOnce(startMiddlewareStub);
        const [argReq] = startMiddlewareStub.firstCall.args;
        expect(argReq.body).to.deep.equal(usage);
        expect(argReq.headers.authorization).to.equal(samplingAuthHeader);
      });
    });

    const startWithErrorTest = (givenResponseCode, expectedError) => {
      beforeEach(() => {
        stubStatusCode(givenResponseCode);
      });

      it('raises an error', async () => {
        await expect(client.startSampling(usage)).to.be.rejectedWith(expectedError);
      });
    };

    context('when bad request is returned by receiver', () => {
      startWithErrorTest(httpStatus.BAD_REQUEST, BadRequestError);
    });

    context('when conflict is returned by receiver', () => {
      startWithErrorTest(httpStatus.CONFLICT, ConflictError);
    });

    context('when unknown error is returned by receiver', () => {
      startWithErrorTest(httpStatus.INTERNAL_SERVER_ERROR, APIError);
    });

  });


  describe('#stopSampling', () => {
    const usage = {
      data: 'some-data'
    };

    const stubStatusCode = (statusCode) => {
      stopMiddlewareStub.callsFake((req, resp) => {
        resp.status(statusCode).send();
      });
    };

    context('when samping is successfully stopped', () => {
      beforeEach(() => {
        stubStatusCode(httpStatus.CREATED);
      });

      it('usage is received by receiver', async () => {
        await client.stopSampling(usage);

        assert.calledOnce(stopMiddlewareStub);
        const [argReq] = stopMiddlewareStub.firstCall.args;
        expect(argReq.body).to.deep.equal(usage);
        expect(argReq.headers.authorization).to.equal(samplingAuthHeader);
      });
    });

    const stopWithErrorTest = (givenResponseCode, expectedError) => {
      beforeEach(() => {
        stubStatusCode(givenResponseCode);
      });

      it('raises an error', async () => {
        await expect(client.stopSampling(usage)).to.be.rejectedWith(expectedError);
      });
    };

    context('when bad request is returned by receiver', () => {
      stopWithErrorTest(httpStatus.BAD_REQUEST, BadRequestError);
    });

    context('when conflict is returned by receiver', () => {
      stopWithErrorTest(httpStatus.CONFLICT, ConflictError);
    });

    context('when unprocessable entity is returned by receiver', () => {
      stopWithErrorTest(httpStatus.UNPROCESSABLE_ENTITY, UnprocessableEntityError);
    });

    context('when unknown error is returned by receiver', () => {
      stopWithErrorTest(httpStatus.INTERNAL_SERVER_ERROR, APIError);
    });

  });

  describe('#createMappings', () => {
    const mapping = {
      data: 'some data'
    };

    const stubStatusCode = (statusCode) => {
      mappingsMiddlewareStub.callsFake((req, resp) => {
        resp.status(statusCode).send();
      });
    };

    context('when mapping is successfully created', () => {

      beforeEach(() => {
        stubStatusCode(httpStatus.CREATED);
      });

      it('mapping data is received by receiver', async () => {
        await client.createMappings(mapping);

        assert.calledOnce(mappingsMiddlewareStub);
        const [argReq] = mappingsMiddlewareStub.firstCall.args;
        expect(argReq.body).to.deep.equal(mapping);
        expect(argReq.headers.authorization).to.equal(mappingsAuthHeader);
      });
    });

    const createMappingWithErrorTest = (givenResponseCode, expectedError) => {
      beforeEach(() => {
        stubStatusCode(givenResponseCode);
      });

      it('raises an error', async () => {
        await expect(client.createMappings(mapping)).to.be.rejectedWith(expectedError);
      });
    };

    context('when conflict is returned by receiver', () => {
      createMappingWithErrorTest(httpStatus.CONFLICT, ConflictError);
    });

    context('when unknown error is returned by receiver', () => {
      createMappingWithErrorTest(httpStatus.INTERNAL_SERVER_ERROR, APIError);
    });

  });
});
