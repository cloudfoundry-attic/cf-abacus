'use strict';

const http = require('http');
const util = require('util');
const express = require('express');
const httpStatus = require('http-status-codes');

const { ReportingClient } = require('../../lib/clients/reporting-client');
const { APIError } = require('../../lib/errors');

describe('ReportingClient', () => {
  const skipSslValidation = false;
  const authHeader = 'Authorization: value';
  let reportingMiddlewareStub;
  let server;
  let client;

  const stubStatusCode = (statusCode, body) => {
    reportingMiddlewareStub.callsFake((req, resp) => {
      resp.status(statusCode).send(body);
    });
  };

  before(async () => {
    reportingMiddlewareStub = sinon.stub();
    const app = express();
    app.get('/v1/metering/organizations/:organization_id/aggregated/usage/:time', reportingMiddlewareStub);

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);
  });

  after(async () => {
    await server.close();
  });

  beforeEach(async () => {
    const port = server.address().port;
    const authHeaderProviderStub = {
      getHeader: sinon.stub().callsFake(async () => authHeader)
    };
    client = new ReportingClient(`http://localhost:${port}`, authHeaderProviderStub, skipSslValidation);
  });

  describe('#getReport', () => {
    const orgId = 'organization-id';
    const timestamp = '1234';
    const testBody = 'test-body';

    const getOrgReport = async () => {
      return await client.getReport(orgId, timestamp);
    };

    context('when server returns organization usage report', () => {
      beforeEach(() => {
        stubStatusCode(httpStatus.OK, testBody);
      });

      it('gets report', async () => {
        const report = await getOrgReport();

        assert.calledOnce(reportingMiddlewareStub);
        const [argReq] = reportingMiddlewareStub.firstCall.args;
        expect(argReq.url).to.equal(`/v1/metering/organizations/${orgId}/aggregated/usage/${timestamp}`);
        expect(argReq.headers.authorization).to.equal(authHeader);
        expect(report).to.deep.equal(testBody);
      });
    });

    context('when server does not returns organization usage report for unknown reasons', () => {
      beforeEach(() => {
        stubStatusCode(httpStatus.BAD_GATEWAY, {});
      });

      it('raises an error', async () => {
        await expect(getOrgReport()).to.be.rejectedWith(APIError);
      });
    });
  });
});
