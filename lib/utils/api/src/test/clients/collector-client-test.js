'use strict';

const http = require('http');
const util = require('util');
const { extend } = require('underscore');
const express = require('express');
const bodyParser = require('body-parser');
const httpStatus = extend({}, require('http-status-codes'), {
  UNAVAILABLE_FOR_LEGAL_REASONS: 451
});
const { CollectorClient } = require('../../lib/clients/collector-client');
const {
  APIError,
  BadRequestError,
  UnavailableForLegalReasonsError,
  TooManyRequestsError
} = require('../../lib/errors');

describe('CollectorClient', () => {
  const skipSslValidation = false;
  const authHeader = 'Authorization: value';
  let usageMiddlewareStub;
  let server;
  let client;

  const stubResponse = (statusCode, body) => {
    usageMiddlewareStub.callsFake((req, resp) => {
      resp.status(statusCode).send(body);
    });
  };

  before(async () => {
    usageMiddlewareStub = sinon.stub();
    const app = express();
    app.use(bodyParser.json());
    app.post('/v1/metering/collected/usage', usageMiddlewareStub);

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
    client = new CollectorClient(`http://localhost:${port}`, {
      authHeaderProvider: authHeaderProviderStub,
      skipSslValidation
    });
  });

  describe('#postUsage', () => {
    const usage = {
      organization_id: 'org',
      space_id: 'space',
      etc: 'irrelevant'
    };

    const postUsage = async () => {
      return await client.postUsage(usage);
    };

    context('when server accepts usage', () => {
      beforeEach(() => {
        stubResponse(httpStatus.ACCEPTED);
      });

      it('sends usage to server', async () => {
        await postUsage();

        assert.calledOnce(usageMiddlewareStub);
        const [argReq] = usageMiddlewareStub.firstCall.args;
        expect(argReq.body).to.deep.equal(usage);
        expect(argReq.headers.authorization).to.equal(authHeader);
      });
    });

    context('when server rejects usage for bad request', () => {
      const errorDescription = 'error description';

      beforeEach(() => {
        stubResponse(httpStatus.BAD_REQUEST, { name: errorDescription });
      });

      it('raises an error', async () => {
        await expect(postUsage()).to.be.rejectedWith(BadRequestError, errorDescription);
      });
    });

    context('when server rejects usage for legal reasons', () => {
      beforeEach(() => {
        stubResponse(httpStatus.UNAVAILABLE_FOR_LEGAL_REASONS);
      });

      it('raises an error', async () => {
        await expect(postUsage()).to.be.rejectedWith(UnavailableForLegalReasonsError);
      });
    });

    context('when server rejects usage due to rate limiting', () => {
      beforeEach(() => {
        usageMiddlewareStub.callsFake((req, resp) => {
          resp.set('Retry-After', '41').status(httpStatus.TOO_MANY_REQUESTS).send();
        });
      });

      it('raises an error', async () => {
        const clientErr = await expect(postUsage()).to.be.rejectedWith(TooManyRequestsError);
        expect(clientErr.retryAfter).to.equal(41);
      });
    });

    context('when server rejects usage for unknown reasons', () => {
      beforeEach(() => {
        stubResponse(httpStatus.BAD_GATEWAY);
      });

      it('raises an error', async () => {
        await expect(postUsage()).to.be.rejectedWith(APIError);
      });
    });
  });
});
