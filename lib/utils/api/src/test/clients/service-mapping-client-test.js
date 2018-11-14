'use strict';


const http = require('http');
const util = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const httpStatus = require('http-status-codes');
const { ServiceMappingClient } = require('../../lib/clients/service-mapping-client');
const { APIError } = require('../../lib/errors');


describe('ServiceMappingClient', () => {
  const authHeader = 'Basic 123';
  const skipSslValidation = true;
  let server;
  let client;

  let createServiceMappingMiddleware;

  before(async () => {
    const authHeaderProviderStub = {
      getHeader: sinon.stub().callsFake(async () => authHeader)
    };

    const app = express();
    app.use(bodyParser.json());

    createServiceMappingMiddleware = sinon.stub();
    app.post('/v1/provisioning/mappings/services/resource/:resource/plan/:plan', createServiceMappingMiddleware);

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);

    const port = server.address().port;
    client = new ServiceMappingClient(`http://localhost:${port}`, authHeaderProviderStub, skipSslValidation);
  });

  describe('#createServiceMapping', () => {
    const resource = 'resource-id';
    const plan = 'plan-id';
    const serviceMapping = {
      id: 1
    };

    context('when server responds with "ok" status code', () => {
      beforeEach(() => {
        createServiceMappingMiddleware.callsFake((req, resp) => {
          resp.status(httpStatus.OK).send();
        });
      });

      it('calls endpoint', async () => {
        await client.createServiceMapping(resource, plan, serviceMapping);

        assert.calledOnce(createServiceMappingMiddleware);
        const [argReq] = createServiceMappingMiddleware.firstCall.args;
        expect(argReq.body).to.deep.equal(serviceMapping);
        expect(argReq.params.resource).to.equal(resource);
        expect(argReq.params.plan).to.equal(plan);
        expect(argReq.headers.authorization).to.equal(authHeader);
      });
    });

    context('when server responds with unknown status code', () => {
      beforeEach(() => {
        createServiceMappingMiddleware.callsFake((req, resp) => {
          resp.status(httpStatus.BAD_GATEWAY).send();
        });
      });

      it('throws a generic api error', async () => {
        await expect(client.createServiceMapping(resource, plan, serviceMapping)).to.be.rejectedWith(APIError);
      });
    });

  });

});
