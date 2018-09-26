'use strict';

const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const httpStatus = require('http-status-codes');

const { ReceiverClient } = require('../lib/receiver-client');

const { ConflictError, APIError, UnprocessableEntityError } = require('../lib/errors');

describe('Receiver Client', () => {
  let startMiddlewareStub;
  let stopMiddlewareStub;
  let server;
  let client;

  before(async () => {
    startMiddlewareStub = sinon.stub();
    stopMiddlewareStub = sinon.stub();

    const app = express();
    app.use(bodyParser.json());
    app.post('/v1/events/start', startMiddlewareStub);
    app.post('/v1/events/stop', stopMiddlewareStub);

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);
  });

  beforeEach(() => {
    const port = server.address().port;
    client = new ReceiverClient(`http://localhost:${port}`);
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
});
