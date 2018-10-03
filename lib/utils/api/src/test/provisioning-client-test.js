'use strict';

const http = require('http');
const util = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const httpStatus = require('http-status-codes');
const { ProvisioningClient } = require('../lib/provisioning-client');
const { APIError, ConflictError, TooManyRequestsError } = require('../lib/errors');

describe('ProvisioningClient', () => {
  const authHeader = 'auth-header-content';
  const resourceID = 'test-resource-id';
  const planID = 'test-plan-id';
  const planMapping = 'test-metering-plan';

  let meteringMappingMiddleware;
  let ratingMappingMiddleware;
  let pricingMappingMiddleware;
  let authHeaderStub;

  let server;
  let client;

  before(async () => {
    meteringMappingMiddleware = sinon.stub();
    ratingMappingMiddleware = sinon.stub();
    pricingMappingMiddleware = sinon.stub();
    authHeaderStub = sinon.stub().returns(authHeader);

    const app = express();
    app.use(bodyParser.json());
    app.post(
      '/v1/provisioning/mappings/metering/resources/:resource_id/plans/:plan_id/:mapped_plan',
      meteringMappingMiddleware
    );
    app.post(
      '/v1/provisioning/mappings/rating/resources/:resource_id/plans/:plan_id/:mapped_plan',
      ratingMappingMiddleware
    );
    app.post(
      '/v1/provisioning/mappings/pricing/resources/:resource_id/plans/:plan_id/:mapped_plan',
      pricingMappingMiddleware
    );

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);

    const port = server.address().port;
    client = new ProvisioningClient(`http://localhost:${port}`, authHeaderStub);
  });

  after(async () => {
    await server.close();
  });

  // the tests for mapMeteringPlan, mapRatingPlan, and mapPricingPlan
  // are almost identical (they are the same from an execution flow perspective).
  // this construct allows the reuse of the test cases for all the methods.
  const constructMappingDescribe = (name, opts) => {
    const { getMiddlewareStub, postMapping } = opts;

    describe(name, () => {
      let middlewareStub;

      context('when server responds with "ok" status code', () => {
        beforeEach(() => {
          middlewareStub = getMiddlewareStub();
          middlewareStub.callsFake((req, resp) => {
            resp.status(httpStatus.OK).send();
          });
        });

        it('calls endpoint', async () => {
          await postMapping();

          assert.calledOnce(middlewareStub);
          const [argReq] = middlewareStub.firstCall.args;
          expect(argReq.params.resource_id).to.equal(resourceID);
          expect(argReq.params.plan_id).to.equal(planID);
          expect(argReq.params.mapped_plan).to.equal(planMapping);
          expect(argReq.headers.authorization).to.equal(authHeader);
        });
      });

      context('when server responds with "conflict" status code', () => {
        beforeEach(() => {
          middlewareStub.callsFake((req, resp) => {
            resp.status(httpStatus.CONFLICT).send();
          });
        });

        it('throw a conflict error', async () => {
          await expect(postMapping()).to.be.rejectedWith(ConflictError);
        });
      });

      context('when server responds with "too many requests" status code', () => {
        beforeEach(() => {
          middlewareStub.callsFake((req, resp) => {
            resp.set('Retry-After', '41').status(httpStatus.TOO_MANY_REQUESTS).send();
          });
        });

        it('throws a too many requests error', async () => {
          const clientErr = await expect(postMapping()).to.be.rejectedWith(TooManyRequestsError);
          expect(clientErr.retryAfter).to.equal(41);
        });
      });

      context('when server responds with unknown status code', () => {
        beforeEach(() => {
          middlewareStub.callsFake((req, resp) => {
            resp.status(httpStatus.BAD_GATEWAY).send();
          });
        });

        it('throws a generic api error', async () => {
          await expect(postMapping()).to.be.rejectedWith(APIError);
        });
      });
    });
  };

  // here we build the describes for the three methods

  constructMappingDescribe('#mapMeteringPlan', {
    postMapping: async () => {
      await client.mapMeteringPlan(resourceID, planID, planMapping);
    },
    getMiddlewareStub: () => meteringMappingMiddleware
  });

  constructMappingDescribe('#mapRatingPlan', {
    postMapping: async () => {
      await client.mapRatingPlan(resourceID, planID, planMapping);
    },
    getMiddlewareStub: () => ratingMappingMiddleware
  });

  constructMappingDescribe('#mapPricingPlan', {
    postMapping: async () => {
      await client.mapPricingPlan(resourceID, planID, planMapping);
    },
    getMiddlewareStub: () => pricingMappingMiddleware
  });
});
