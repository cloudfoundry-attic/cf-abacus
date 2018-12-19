'use strict';

const http = require('http');
const util = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const httpStatus = require('http-status-codes');
const { ProvisioningClient } = require('../../lib/clients/provisioning-client');
const { RequestStrategy } = require('../../lib/request-strategy');
const { APIError, ConflictError, TooManyRequestsError, BadRequestError } = require('../../lib/errors');

describe('ProvisioningClient', () => {
  const planId = '123';
  const skipSslValidation = false;
  const authHeader = 'auth-header-content';
  const resourceID = 'test-resource-id';
  const planID = 'test-plan-id';
  const planMapping = 'test-metering-plan';

  let middlewareSandbox;

  let meteringMappingMiddleware;
  let ratingMappingMiddleware;
  let pricingMappingMiddleware;

  let createMeteringPlanMiddleware;
  let createRatingPlanMiddleware;
  let createPricingPlanMiddleware;

  let updateMeteringPlanMiddleware;
  let updateRatingPlanMiddleware;
  let updatePricingPlanMiddleware;

  let validateMiddleware;

  let server;
  let client;

  before(async () => {
    const authHeaderProviderStub = {
      getHeader: sinon.stub().callsFake(async () => authHeader)
    };

    const app = express();
    app.use(bodyParser.json());

    middlewareSandbox = sinon.createSandbox();

    meteringMappingMiddleware = middlewareSandbox.stub();
    app.post(
      '/v1/provisioning/mappings/metering/resources/:resource_id/plans/:plan_id/:mapped_plan',
      meteringMappingMiddleware
    );
    ratingMappingMiddleware = middlewareSandbox.stub();
    app.post(
      '/v1/provisioning/mappings/rating/resources/:resource_id/plans/:plan_id/:mapped_plan',
      ratingMappingMiddleware
    );
    pricingMappingMiddleware = middlewareSandbox.stub();
    app.post(
      '/v1/provisioning/mappings/pricing/resources/:resource_id/plans/:plan_id/:mapped_plan',
      pricingMappingMiddleware
    );

    createMeteringPlanMiddleware = middlewareSandbox.stub();
    app.post('/v1/metering/plans', createMeteringPlanMiddleware);
    createRatingPlanMiddleware = middlewareSandbox.stub();
    app.post('/v1/rating/plans', createRatingPlanMiddleware);
    createPricingPlanMiddleware = middlewareSandbox.stub();
    app.post('/v1/pricing/plans', createPricingPlanMiddleware);

    updateMeteringPlanMiddleware = middlewareSandbox.stub();
    app.put(`/v1/metering/plan/${planId}`, updateMeteringPlanMiddleware);
    updateRatingPlanMiddleware = middlewareSandbox.stub();
    app.put(`/v1/rating/plan/${planId}`, updateRatingPlanMiddleware);
    updatePricingPlanMiddleware = middlewareSandbox.stub();
    app.put(`/v1/pricing/plan/${planId}`, updatePricingPlanMiddleware);

    validateMiddleware = middlewareSandbox.stub();
    app.get(
      '/v1/provisioning/organizations/:organization_id/spaces/:space_id/consumers/:consumer_id/' +
      'resources/:resource_id/plans/:plan_id/instances/:resource_instance_id/:time',
      validateMiddleware
    );

    server = http.createServer(app);
    const listen = util.promisify(server.listen).bind(server);
    await listen(0);

    const port = server.address().port;
    client = new ProvisioningClient(
      `http://localhost:${port}`, {
        authHeaderProvider: authHeaderProviderStub,
        skipSslValidation
      },
      RequestStrategy.direct()
    );
  });

  beforeEach(() => {
    middlewareSandbox.reset();
  });

  after(async () => {
    await server.close();
  });

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

  const constructPlanOperationDescribe = (name, opts) => {
    const plan = {
      plan_id: planId
    };
    const { getMiddlewareStub, planOperation, successfulStatusCode } = opts;

    describe(name, () => {
      let middlewareStub;

      beforeEach(() => {
        middlewareStub = getMiddlewareStub();
      });

      context('when server responds with successful status code', () => {
        beforeEach(() => {
          middlewareStub = getMiddlewareStub();
          middlewareStub.callsFake((req, resp) => {
            resp.status(successfulStatusCode).send();
          });
        });

        it('calls endpoint', async () => {
          await planOperation(plan);

          assert.calledOnce(middlewareStub);
          const [argReq] = middlewareStub.firstCall.args;
          expect(argReq.body).to.deep.equal(plan);
          expect(argReq.headers.authorization).to.equal(authHeader);
        });
      });

      context('when server responds with "bad request" status code', () => {
        const errorMessage = 'some error message';

        beforeEach(() => {
          middlewareStub.callsFake((req, resp) => {
            resp.status(httpStatus.BAD_REQUEST).send({
              message: errorMessage
            });
          });
        });

        it('throws a "bad request" error', async () => {
          await expect(planOperation(plan)).to.be.rejectedWith(BadRequestError, errorMessage);
        });
      });

      context('when server responds with unknown status code', () => {
        beforeEach(() => {
          middlewareStub.callsFake((req, resp) => {
            resp.status(httpStatus.BAD_GATEWAY).send();
          });
        });

        it('throws a generic api error', async () => {
          await expect(planOperation(plan)).to.be.rejectedWith(APIError);
        });
      });
    });
  };

  const constructCreatePlanDescribe = (name, opts) => {
    constructPlanOperationDescribe(name, {
      getMiddlewareStub: opts.getMiddlewareStub,
      planOperation: opts.createPlan,
      successfulStatusCode: httpStatus.CREATED
    });
  };

  const constructUpdatePlanDescribe = (name, opts) => {
    constructPlanOperationDescribe(name, {
      getMiddlewareStub: opts.getMiddlewareStub,
      planOperation: opts.updatePlan,
      successfulStatusCode: httpStatus.OK
    });
  };


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

  constructCreatePlanDescribe('#createMeteringPlan', {
    createPlan: async (plan) => {
      await client.createMeteringPlan(plan);
    },
    getMiddlewareStub: () => createMeteringPlanMiddleware
  });

  constructCreatePlanDescribe('#createRatingPlan', {
    createPlan: async (plan) => {
      await client.createRatingPlan(plan);
    },
    getMiddlewareStub: () => createRatingPlanMiddleware
  });

  constructCreatePlanDescribe('#createPricingPlan', {
    createPlan: async (plan) => {
      await client.createPricingPlan(plan);
    },
    getMiddlewareStub: () => createPricingPlanMiddleware
  });

  constructUpdatePlanDescribe('#updateMeteringPlan', {
    updatePlan: async (plan) => {
      await client.updateMeteringPlan(plan);
    },
    getMiddlewareStub: () => updateMeteringPlanMiddleware
  });

  constructUpdatePlanDescribe('#updateRatingPlan', {
    updatePlan: async (plan) => {
      await client.updateRatingPlan(plan);
    },
    getMiddlewareStub: () => updateRatingPlanMiddleware
  });

  constructUpdatePlanDescribe('#updatePricingPlan', {
    updatePlan: async (plan) => {
      await client.updatePricingPlan(plan);
    },
    getMiddlewareStub: () => updatePricingPlanMiddleware
  });

  describe('#isResourceInstanceValid', () => {

    const resourceInstance = {
      organizationId: 'organization-id',
      spaceId: 'space-id',
      consumerId: 'consumer-id',
      resourceId: 'resource-id',
      planId: 'plan-id',
      resourceInstanceId: 'resource-instance-id'
    };

    const time = '123';

    context('when server responds with "ok" status code', () => {

      beforeEach(() => {
        validateMiddleware.callsFake((req, resp) => {
          resp.status(httpStatus.OK).send();
        });
      });

      it('should return "true" ', async () => {
        const isValid = await client.isResourceInstanceValid(resourceInstance, time);
        expect(isValid).to.equals(true);

        assert.calledOnce(validateMiddleware);
        const [argReq] = validateMiddleware.firstCall.args;
        expect(argReq.params.organization_id).to.equal(resourceInstance.organizationId);
        expect(argReq.params.space_id).to.equal(resourceInstance.spaceId);
        expect(argReq.params.consumer_id).to.equal(resourceInstance.consumerId);
        expect(argReq.params.resource_id).to.equal(resourceInstance.resourceId);
        expect(argReq.params.plan_id).to.equal(resourceInstance.planId);
        expect(argReq.params.resource_instance_id).to.equal(resourceInstance.resourceInstanceId);
        expect(argReq.params.time).to.equal(time);
      });
    });

    context('when server responds with "internal server error" status code', () => {

      beforeEach(() => {
        validateMiddleware.callsFake((req, resp) => {
          resp.status(httpStatus.INTERNAL_SERVER_ERROR).send();
        });
      });

      it('throws a generic api error', async () => {
        await expect(client.isResourceInstanceValid(resourceInstance, time)).to.be.rejectedWith(APIError);
      });
    });

    context('when server responds with generic "not found" status code', () => {

      beforeEach(() => {
        validateMiddleware.callsFake((req, resp) => {
          resp.status(httpStatus.NOT_FOUND).send();
        });
      });

      it('throws a generic api error', async () => {
        await expect(client.isResourceInstanceValid(resourceInstance, time)).to.be.rejectedWith(APIError);
      });
    });

    context('when server responds with resource instance "not found" status code', () => {

      beforeEach(() => {
        validateMiddleware.callsFake((req, resp) => {
          resp.status(httpStatus.NOT_FOUND).send({
            error: 'resource instance is not found'
          });
        });
      });

      it('throws a generic api error', async () => {
        const isValid = await client.isResourceInstanceValid(resourceInstance, time);
        expect(isValid).to.equals(false);
      });
    });

  });
});
