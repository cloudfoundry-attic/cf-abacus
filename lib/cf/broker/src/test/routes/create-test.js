'use strict';

const httpStatus = require('http-status-codes');
const createServiceHandler = require('../../routes/create-service');
const { APIError, BadRequestError } = require('abacus-api');

describe('Create Service', () => {

  context('when createService is called', () => {
    const provisioningUrl = 'http://provisioning.url';
    const mappingApi = 'http://mapping.api';
    const generatedPlanId = 'generated-plan-id';
    const defaultPlanName = 'default-plan-name';
    const dashboardUrl = 'dashboard-url';
    const meteringPlan = {
      id: 'metering-plan'
    };
    const pricingPlan = {
      id: 'pricing-plan'
    };
    const ratingPlan = {
      id: 'rating-plan'
    };
    const resourceProvider = {
      service_plan_name: 'service-plan-name',
      service_name: 'service-name'
    };
    const userProvidedPlan = {
      plan_id: 'plan-id'
    };
    const serviceConfig = {
      userProvidedPlan: userProvidedPlan,
      resourceProvider: resourceProvider
    };

    const createRequest = (parameters) => ({
      params: {
        instance_id: 'instance-id'
      },
      body: {
        context: {
          organization_guid: 'organization-guid',
          space_guid: 'space-guid'
        },
        parameters: parameters
      }
    });

    const parameters = {
      parameter: '1'
    };
    const requestWithParameters = createRequest(parameters);

    let serviceMappingClientStub;
    let provisioningClientStub;
    let configStub;
    let planBuilderStub;
    let response;

    let handleCreateService;

    beforeEach(async () => {
      serviceMappingClientStub = {
        createServiceMapping: sinon.stub().callsFake(async () => {})
      };

      provisioningClientStub = {
        createMeteringPlan: sinon.stub().callsFake(async () => {}),
        createPricingPlan: sinon.stub().callsFake(async () => {}),
        createRatingPlan: sinon.stub().callsFake(async () => {}),
        mapMeteringPlan: sinon.stub().callsFake(async () => {}),
        mapPricingPlan: sinon.stub().callsFake(async () => {}),
        mapRatingPlan: sinon.stub().callsFake(async () => {})
      };

      configStub = {
        getServiceConfiguration: sinon.stub(),
        generatePlanId: sinon.stub().returns(generatedPlanId),
        defaultPlanName: defaultPlanName,
        dashboardUrl: sinon.stub().returns(dashboardUrl),
        getMappingApi: sinon.stub().returns(mappingApi),
        uris: sinon.stub().returns({
          provisioning: provisioningUrl
        })
      };

      planBuilderStub = {
        createMeteringPlan: sinon.stub(),
        createPricingPlan: sinon.stub(),
        createRatingPlan: sinon.stub()
      };

      const createServiceMappingClientStub = sinon.stub();
      createServiceMappingClientStub.withArgs(mappingApi).returns(serviceMappingClientStub);

      const createProvisioningClientStub = sinon.stub();
      createProvisioningClientStub.withArgs(provisioningUrl).returns(provisioningClientStub);

      const clientsFactory = {
        createServiceMappingClient: createServiceMappingClientStub,
        createProvisioningClient: createProvisioningClientStub
      };

      handleCreateService = createServiceHandler(
        clientsFactory,
        configStub,
        planBuilderStub
      );

      response = {};
      response.status = sinon.stub().returns(response);
      response.send = sinon.stub();

    });

    const itCreateMeteringPlan = () =>
      it('should create metering plan', () => {
        assert.calledOnce(provisioningClientStub.createMeteringPlan);
        assert.calledWith(provisioningClientStub.createMeteringPlan, meteringPlan);
      });

    const itCreatePricingPlan = () =>
      it('should create pricing plan', () => {
        assert.calledOnce(provisioningClientStub.createPricingPlan);
        assert.calledWith(provisioningClientStub.createPricingPlan, pricingPlan);
      });

    const itCreateRatingPlan = () =>
      it('should create rating plan', () => {
        assert.calledOnce(provisioningClientStub.createRatingPlan);
        assert.calledWith(provisioningClientStub.createRatingPlan, ratingPlan);
      });

    const itMapMeteringPlan = () =>
      it('should create metering mapping', () => {
        assert.calledOnce(provisioningClientStub.mapMeteringPlan);
        assert.calledWith(provisioningClientStub.mapMeteringPlan,
          requestWithParameters.params.instance_id,
          defaultPlanName,
          generatedPlanId);
      });

    const itMapPricingPlan = () =>
      it('should create pricing mapping', () => {
        assert.calledOnce(provisioningClientStub.mapPricingPlan);
        assert.calledWith(provisioningClientStub.mapPricingPlan,
          requestWithParameters.params.instance_id,
          defaultPlanName,
          generatedPlanId);
      });

    const itMapRatingPlan = () =>
      it('should create rating mapping', () => {
        assert.calledOnce(provisioningClientStub.mapRatingPlan);
        assert.calledWith(provisioningClientStub.mapRatingPlan,
          requestWithParameters.params.instance_id,
          defaultPlanName,
          generatedPlanId);
      });

    context('when request parameters are valid', () => {

      context('when request does NOT contain resource provider', () => {

        beforeEach(async () => {
          configStub.getServiceConfiguration.returns({
            userProvidedPlan: userProvidedPlan,
            resourceProvider: undefined
          });

          planBuilderStub.createMeteringPlan.withArgs(generatedPlanId, userProvidedPlan).returns(meteringPlan);
          planBuilderStub.createPricingPlan.withArgs(generatedPlanId, userProvidedPlan).returns(pricingPlan);
          planBuilderStub.createRatingPlan.withArgs(generatedPlanId, userProvidedPlan).returns(ratingPlan);

          await handleCreateService(requestWithParameters, response);
        });

        it('should not create service mapping ', () => {
          assert.notCalled(serviceMappingClientStub.createServiceMapping);
        });

        itCreateMeteringPlan();
        itCreatePricingPlan();
        itCreateRatingPlan();
        itMapMeteringPlan();
        itMapPricingPlan();
        itMapRatingPlan();

      });

      context('when request contains resource provider', () => {

        beforeEach(async () => {
          configStub.getServiceConfiguration.withArgs(parameters).returns(serviceConfig);
        });

        context('when create service mapping is successful', () => {

          beforeEach(async () => {
            planBuilderStub.createMeteringPlan.withArgs(generatedPlanId, userProvidedPlan).returns(meteringPlan);
            planBuilderStub.createPricingPlan.withArgs(generatedPlanId, userProvidedPlan).returns(pricingPlan);
            planBuilderStub.createRatingPlan.withArgs(generatedPlanId, userProvidedPlan).returns(ratingPlan);

            await handleCreateService(requestWithParameters, response);
          });

          it('should create service mapping', () => {
            assert.calledOnce(serviceMappingClientStub.createServiceMapping);
            assert.calledWith(serviceMappingClientStub.createServiceMapping,
              requestWithParameters.params.instance_id,
              `${defaultPlanName}/${generatedPlanId}/${generatedPlanId}/${generatedPlanId}`, {
                organization_guid: requestWithParameters.body.context.organization_guid,
                space_guid: requestWithParameters.body.context.space_guid,
                service_name: resourceProvider.service_name,
                service_plan_name: resourceProvider.service_plan_name
              });
          });

          itCreateMeteringPlan();
          itCreatePricingPlan();
          itCreateRatingPlan();
          itMapMeteringPlan();
          itMapPricingPlan();
          itMapRatingPlan();

          it('should return dashboard url', () => {
            assert.calledOnce(response.send);
            assert.calledWith(response.send, { dashboard_url:dashboardUrl });
            assert.calledOnce(response.status);
            assert.calledWith(response.status, httpStatus.CREATED);
          });

        });

        context('when service mapping url is unavailable', () => {
          beforeEach(async () => {
            configStub.getMappingApi.returns(undefined);
            await handleCreateService(requestWithParameters, response);
          });

          it('should return "bad request"', () => {
            assert.calledOnce(response.send);
            assert.calledWith(response.send, {
              description: 'Invalid plan: resource provider mapping is not supported.'
            });
            assert.calledWith(response.status, httpStatus.BAD_REQUEST);
          });

          it('should NOT create plans and mappings', () => {
            assert.notCalled(provisioningClientStub.createMeteringPlan);
            assert.notCalled(provisioningClientStub.createPricingPlan);
            assert.notCalled(provisioningClientStub.createRatingPlan);
            assert.notCalled(provisioningClientStub.mapMeteringPlan);
            assert.notCalled(provisioningClientStub.mapPricingPlan);
            assert.notCalled(provisioningClientStub.mapRatingPlan);
          });
        });

        context('when create service mapping fails', () => {
          beforeEach(async () => {
            serviceMappingClientStub.createServiceMapping.callsFake(async () => {
              throw new APIError(httpStatus.NOT_FOUND);
            });
            await handleCreateService(requestWithParameters, response);
          });

          it('should return "internal server error"', () => {
            assert.calledOnce(response.send);
            assert.calledWith(response.status, httpStatus.INTERNAL_SERVER_ERROR);
          });

          it('should NOT create plans and mappings', () => {
            assert.notCalled(provisioningClientStub.createMeteringPlan);
            assert.notCalled(provisioningClientStub.createPricingPlan);
            assert.notCalled(provisioningClientStub.createRatingPlan);
            assert.notCalled(provisioningClientStub.mapMeteringPlan);
            assert.notCalled(provisioningClientStub.mapPricingPlan);
            assert.notCalled(provisioningClientStub.mapRatingPlan);
          });
        });

        const createArbitraryErrorContext = (stub) =>
          context('when fails with arbitrary error', () => {
            beforeEach(async () => {
              stub().callsFake(async () => {
                throw new APIError(httpStatus.NOT_FOUND);
              });
              await handleCreateService(requestWithParameters, response);
            });

            it('should return "internal server error"', () => {
              assert.calledWith(response.status, httpStatus.INTERNAL_SERVER_ERROR);
            });

            it('should not return dashboard url', () => {
              assert.calledWithExactly(response.send);
            });
          });

        const createBadRequestErrorContext = (stub) =>
          context('when fails with "bad request" error', () => {
            const errorMessage = 'some error';
            beforeEach(async () => {
              stub().callsFake(async () => {
                throw new BadRequestError(errorMessage);
              });
              await handleCreateService(requestWithParameters, response);
            });

            it('should forward "bad request" error', () => {
              assert.calledWith(response.status, httpStatus.BAD_REQUEST);
            });

            it('should return error description', () => {
              assert.calledWithExactly(response.send, {
                description: `Invalid plan: "${errorMessage}"`
              });
            });
          });


        context('when create metering plan fails', () => {
          createArbitraryErrorContext(() => provisioningClientStub.createMeteringPlan);
          createBadRequestErrorContext(() => provisioningClientStub.createMeteringPlan);
        });
        context('when create pricing plan fails', () => {
          createArbitraryErrorContext(() => provisioningClientStub.createPricingPlan);
          createBadRequestErrorContext(() => provisioningClientStub.createPricingPlan);
        });
        context('when create rating plan fails', () => {
          createArbitraryErrorContext(() => provisioningClientStub.createRatingPlan);
          createBadRequestErrorContext(() => provisioningClientStub.createRatingPlan);
        });
        context('when map metering plan fails', () => {
          createArbitraryErrorContext(() => provisioningClientStub.mapMeteringPlan);
        });
        context('when map pricing plan fails', () => {
          createArbitraryErrorContext(() => provisioningClientStub.mapPricingPlan);
        });
        context('when map rating plan fails', () => {
          createArbitraryErrorContext(() => provisioningClientStub.mapRatingPlan);
        });
      });
    });


    context('when request parameters are not provided', () => {
      const requestWithoutParameters = createRequest();

      beforeEach(async () => {
        planBuilderStub.createMeteringPlan.withArgs(generatedPlanId, undefined).returns(meteringPlan);
        planBuilderStub.createPricingPlan.withArgs(generatedPlanId, undefined).returns(pricingPlan);
        planBuilderStub.createRatingPlan.withArgs(generatedPlanId, undefined).returns(ratingPlan);
        await handleCreateService(requestWithoutParameters, response);
      });

      it('should return "created" ', () => {
        assert.calledOnce(response.send);
        assert.calledWith(response.status, httpStatus.CREATED);
      });

      itCreateMeteringPlan();
      itCreatePricingPlan();
      itCreateRatingPlan();
      itMapMeteringPlan();
      itMapPricingPlan();
      itMapRatingPlan();
    });

    context('when request parameters are NOT valid', () => {

      beforeEach(async () => {
        configStub.getServiceConfiguration.throws(new Error('Invalid service configuration'));
        await handleCreateService(requestWithParameters, response);
      });

      it('should return "bad request" ', () => {
        assert.calledOnce(response.send);
        assert.calledWith(response.status, httpStatus.BAD_REQUEST);
      });

      it('should not create service mapping, plans and plan mappings', () => {
        assert.notCalled(serviceMappingClientStub.createServiceMapping);
        assert.notCalled(provisioningClientStub.createMeteringPlan);
        assert.notCalled(provisioningClientStub.createPricingPlan);
        assert.notCalled(provisioningClientStub.createRatingPlan);
        assert.notCalled(provisioningClientStub.mapMeteringPlan);
        assert.notCalled(provisioningClientStub.mapPricingPlan);
        assert.notCalled(provisioningClientStub.mapRatingPlan);
      });
    });
  });
});
