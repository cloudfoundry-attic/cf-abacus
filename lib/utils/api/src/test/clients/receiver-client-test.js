'use strict';

const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const httpStatus = require('http-status-codes');

const { ReceiverClient } = require('../../lib/clients/receiver-client');

const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UnprocessableEntityError,
  APIError
} = require('../../lib/errors');

describe('Receiver Client', () => {
  const skipSslValidation = false;
  const authHeader = 'authorization-header-content';
  let startMiddlewareStub;
  let stopMiddlewareStub;
  let mappingsMiddlewareStub;
  let server;
  let client;

  before(async () => {
    startMiddlewareStub = sinon.stub();
    stopMiddlewareStub = sinon.stub();
    mappingsMiddlewareStub = sinon.stub();

    const app = express();
    app.use(bodyParser.json());
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
      getHeader: sinon.stub().callsFake(async () => authHeader)
    };
    client = new ReceiverClient(`http://localhost:${port}`, {
      authHeaderProvider: authHeaderProviderStub,
      skipSslValidation
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
        expect(argReq.headers.authorization).to.equal(authHeader);
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

    context('when unauthorized is returned by receiver', () => {
      startWithErrorTest(httpStatus.UNAUTHORIZED, UnauthorizedError);
    });

    context('when forbidded is returned by receiver', () => {
      startWithErrorTest(httpStatus.FORBIDDEN, ForbiddenError);
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
        expect(argReq.headers.authorization).to.equal(authHeader);
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

    context('when unauthorized is returned by receiver', () => {
      stopWithErrorTest(httpStatus.UNAUTHORIZED, UnauthorizedError);
    });

    context('when forbidded is returned by receiver', () => {
      stopWithErrorTest(httpStatus.FORBIDDEN, ForbiddenError);
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
        expect(argReq.headers.authorization).to.equal(authHeader);
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

    context('when unauthorized is returned by receiver', () => {
      createMappingWithErrorTest(httpStatus.UNAUTHORIZED, UnauthorizedError);
    });

    context('when forbidded is returned by receiver', () => {
      createMappingWithErrorTest(httpStatus.FORBIDDEN, ForbiddenError);
    });

    context('when conflict is returned by receiver', () => {
      createMappingWithErrorTest(httpStatus.CONFLICT, ConflictError);
    });

    context('when unknown error is returned by receiver', () => {
      createMappingWithErrorTest(httpStatus.INTERNAL_SERVER_ERROR, APIError);
    });

  });
});
