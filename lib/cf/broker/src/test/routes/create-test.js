'use strict';

const httpStatus = require('http-status-codes');
const serviceCreatorFactory = require('../../routes/create-service');
const { APIError, BadRequestError } = require('abacus-api');

describe('Create Service', () => {

  context('when createService is called', () => {
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
    const createRequest = (resourceProvider)=> ({
      params: {
        instance_id: 'instance-id'
      },
      body: {
        context: {
          organization_guid: 'organization-guid',
          space_guid: 'space-guid'
        },
        parameters: {
          test_parameter: 1,
          plans: [{
            resource_provider: resourceProvider
          }]
        }
      }
    });

    const requestWithResourceProvider = createRequest(resourceProvider);

    let serviceMappingClientStub;
    let provisioningClientStub;
    let configStub;
    let planBuilderStub;
    let response;

    let serviceCreator;


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
        isServiceConfigValid: sinon.stub(),
        generatePlanId: sinon.stub().returns(generatedPlanId),
        defaultPlanName: defaultPlanName,
        dashboardUrl: sinon.stub().returns(dashboardUrl)
      };

      planBuilderStub = {
        createMeteringPlan: sinon.stub(),
        createPricingPlan: sinon.stub(),
        createRatingPlan: sinon.stub()
      };

      serviceCreator = serviceCreatorFactory(serviceMappingClientStub,
        provisioningClientStub,
        configStub,
        planBuilderStub
      );

      response = {};
      response.status = sinon.stub().returns(response);
      response.send = sinon.stub();

    });

    it('should validate request parameters', async () => {
      await serviceCreator.createService(requestWithResourceProvider, response);
      assert.calledOnce(configStub.isServiceConfigValid);
      assert.calledWith(configStub.isServiceConfigValid, requestWithResourceProvider.body.parameters);
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
          requestWithResourceProvider.params.instance_id,
          defaultPlanName,
          generatedPlanId);
      });

    const itMapPricingPlan = () =>
      it('should create pricing mapping', () => {
        assert.calledOnce(provisioningClientStub.mapPricingPlan);
        assert.calledWith(provisioningClientStub.mapPricingPlan,
          requestWithResourceProvider.params.instance_id,
          defaultPlanName,
          generatedPlanId);
      });

    const itMapRatingPlan = () =>
      it('should create rating mapping', () => {
        assert.calledOnce(provisioningClientStub.mapRatingPlan);
        assert.calledWith(provisioningClientStub.mapRatingPlan,
          requestWithResourceProvider.params.instance_id,
          defaultPlanName,
          generatedPlanId);
      });

    context('when request parameters validation is successful', () => {

      beforeEach(async () => {
        configStub.isServiceConfigValid.returns(true);
      });

      context('when request does NOT contain resource provider', () => {

        beforeEach(async () => {
          const requestWithoutResourceProvider = createRequest();
          planBuilderStub.createMeteringPlan.withArgs(generatedPlanId,
            requestWithoutResourceProvider.body.parameters.plans[0]).returns(meteringPlan);
          planBuilderStub.createPricingPlan.withArgs(generatedPlanId,
            requestWithoutResourceProvider.body.parameters.plans[0]).returns(pricingPlan);
          planBuilderStub.createRatingPlan.withArgs(generatedPlanId,
            requestWithoutResourceProvider.body.parameters.plans[0]).returns(ratingPlan);

          await serviceCreator.createService(requestWithoutResourceProvider, response);
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

        context('when create service mapping is successful', () => {

          beforeEach(async () => {
            planBuilderStub.createMeteringPlan.withArgs(generatedPlanId,
              requestWithResourceProvider.body.parameters.plans[0]).returns(meteringPlan);
            planBuilderStub.createPricingPlan.withArgs(generatedPlanId,
              requestWithResourceProvider.body.parameters.plans[0]).returns(pricingPlan);
            planBuilderStub.createRatingPlan.withArgs(generatedPlanId,
              requestWithResourceProvider.body.parameters.plans[0]).returns(ratingPlan);

            await serviceCreator.createService(requestWithResourceProvider, response);
          });

          it('should create service mapping', () => {
            assert.calledOnce(serviceMappingClientStub.createServiceMapping);
            assert.calledWith(serviceMappingClientStub.createServiceMapping,
              requestWithResourceProvider.params.instance_id,
              `${defaultPlanName}/${generatedPlanId}/${generatedPlanId}/${generatedPlanId}`, {
                organization_guid: requestWithResourceProvider.body.context.organization_guid,
                space_guid: requestWithResourceProvider.body.context.space_guid,
                service_name: requestWithResourceProvider.body.parameters.plans[0].resource_provider.service_name,
                service_plan_name:
                  requestWithResourceProvider.body.parameters.plans[0].resource_provider.service_plan_name
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

        context('when create service mapping fails', () => {
          beforeEach(async () => {
            serviceMappingClientStub.createServiceMapping.callsFake(async () => {
              throw new APIError(httpStatus.NOT_FOUND);
            });
            await serviceCreator.createService(requestWithResourceProvider, response);
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
              await serviceCreator.createService(requestWithResourceProvider, response);
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
              await serviceCreator.createService(requestWithResourceProvider, response);
            });

            it('should forward "bad request" error', () => {
              assert.calledWith(response.status, httpStatus.BAD_REQUEST);
            });

            it('should return error description', () => {
              assert.calledWithExactly(response.send, {
                description: `Provided plan is not valid. Error: "${errorMessage}"`
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
      const requestWithoutParameters = {
        params: {
          instance_id: 'instance-id'
        },
        body: {
          context: {
            organization_guid: 'organization-guid',
            space_guid: 'space-guid'
          }
        }
      };

      beforeEach(async () => {
        planBuilderStub.createMeteringPlan.withArgs(generatedPlanId, undefined).returns(meteringPlan);
        planBuilderStub.createPricingPlan.withArgs(generatedPlanId, undefined).returns(pricingPlan);
        planBuilderStub.createRatingPlan.withArgs(generatedPlanId, undefined).returns(ratingPlan);
        await serviceCreator.createService(requestWithoutParameters, response);
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

    context('when request parameters validation is NOT successful', () => {

      beforeEach(async () => {
        configStub.isServiceConfigValid.returns(false);
        await serviceCreator.createService(requestWithResourceProvider, response);
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
