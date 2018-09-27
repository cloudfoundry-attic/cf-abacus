'use strict';

const util = require('util');
const http = require('http');
const bodyParser = require('body-parser');
const express = require('express');
const httpStatus = require('http-status-codes');

const { ReceiverClient } = require('../lib/receiver-client');

const { ConflictError, APIError } = require('../lib/errors');

describe('Receiver Client', () => {
  let startMiddlewareStub;
  let server;
  let client;

  before(async () => {
    startMiddlewareStub = sinon.stub();
    const app = express();
    app.use(bodyParser.json());
    app.post('/v1/events/start', startMiddlewareStub);

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);
  });

  beforeEach(async () => {
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

    context('when conflict is returned by receiver', () => {
      beforeEach(() => {
        stubStatusCode(httpStatus.CONFLICT);
      });

      it('raises an error', async () => {
        await expect(client.startSampling(usage)).to.be.rejectedWith(ConflictError);
      });
    });

    context('when unknown error is returned by receiver', () => {

      beforeEach(() => {
        stubStatusCode(httpStatus.INTERNAL_SERVER_ERROR);
      });

      it('raises an error', async () => {
        await expect(client.startSampling(usage)).to.be.rejectedWith(APIError);
      });
    });

  });
});
