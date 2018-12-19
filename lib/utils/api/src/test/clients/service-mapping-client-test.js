'use strict';


const http = require('http');
const util = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const httpStatus = require('http-status-codes');
const { ServiceMappingClient } = require('../../lib/clients/service-mapping-client');
const { APIError } = require('../../lib/errors');


describe('ServiceMappingClient', () => {
  const resource = 'resource-id';
  const plan = 'plan-id';
  const serviceMapping = {
    id: 1
  };
  const authHeader = 'Basic 123';
  const skipSslValidation = true;
  let server;
  let client;

  let createServiceMappingMiddleware;
  let updateServiceMappingMiddleware;

  before(async () => {
    const authHeaderProviderStub = {
      getHeader: sinon.stub().callsFake(async () => authHeader)
    };

    const app = express();
    app.use(bodyParser.json());

    createServiceMappingMiddleware = sinon.stub();
    app.post('/v1/provisioning/mappings/services/resource/:resource/plan/:plan', createServiceMappingMiddleware);
    updateServiceMappingMiddleware = sinon.stub();
    app.put('/v1/provisioning/mappings/services/resource/:resource/plan/:plan', updateServiceMappingMiddleware);

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);

    const port = server.address().port;
    client = new ServiceMappingClient(`http://localhost:${port}`, {
      authHeaderProvider: authHeaderProviderStub,
      skipSslValidation
    });
  });

  const contextOk = (middleware, serviceMappingOperation) =>
    context('when server responds with "ok" status code', () => {

      beforeEach(() => {
        middleware().callsFake((req, resp) => {
          resp.status(httpStatus.OK).send();
        });
      });

      it('calls endpoint', async () => {
        await serviceMappingOperation(resource, plan, serviceMapping);

        assert.calledOnce(middleware());
        const [argReq] = middleware().firstCall.args;
        expect(argReq.body).to.deep.equal(serviceMapping);
        expect(argReq.params.resource).to.equal(resource);
        expect(argReq.params.plan).to.equal(plan);
        expect(argReq.headers.authorization).to.equal(authHeader);
      });
    });

  const contextError = (middleware, serviceMappingOperation) =>
    context('when server responds with unknown status code', () => {
      beforeEach(() => {
        middleware().callsFake((req, resp) => {
          resp.status(httpStatus.BAD_GATEWAY).send();
        });
      });

      it('throws a generic api error', async () => {
        await expect(serviceMappingOperation(resource, plan, serviceMapping)).to.be.rejectedWith(APIError);
      });
    });

  describe('#createServiceMapping', () => {

    contextOk(
      () => createServiceMappingMiddleware,
      async (resource, plan, serviceMapping) => await client.createServiceMapping(resource, plan, serviceMapping)
    );

    contextError(
      () => createServiceMappingMiddleware,
      async (resource, plan, serviceMapping) => await client.createServiceMapping(resource, plan, serviceMapping)
    );
  });

  describe('#updateServiceMapping', () => {

    contextOk(
      () => updateServiceMappingMiddleware,
      async (resource, plan, serviceMapping) => await client.updateServiceMapping(resource, plan, serviceMapping)
    );

    contextError(
      () => updateServiceMappingMiddleware,
      async (resource, plan, serviceMapping) => await client.updateServiceMapping(resource, plan, serviceMapping)
    );
  });
});
