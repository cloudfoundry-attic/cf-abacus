'use strict';

const { extend } = require('underscore');

const httpStatus = require('http-status-codes');
const request = require('abacus-request');

const config = require('../../config.js');
const meteringPlan = require('../../plans/metering.js');

const { APIError } = require('abacus-api');

describe('Create service instance', () => {
  const sandbox = sinon.createSandbox();

  let serviceMappingClientStub;
  let provisioningClientStub;

  let postStub;
  let statusCode;
  let mappingsStatusCode;
  let errorMessage;
  let createService;

  const testInstanceId = 'testInstanceId';
  const testServiceId = 'testServiceId';
  const testOrgGuid = '34kj34kj-0be6-45f3-a1f0-1d3fe41db4dd';
  const testSpaceGuid = '12hg12hg-c3cb-4bc1-ac74-f9bf4d9df83c';

  const planConfig = {
    'instance_id': testInstanceId,
    'service_id': testServiceId
  };

  const formattedPlanId = config.generatePlanId(testInstanceId, testInstanceId);

  before(() => {
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;
  });

  afterEach(() => {
    sandbox.restore();
    mappingsStatusCode = undefined;
    statusCode = undefined;
  });

  beforeEach(() => {
    postStub = sandbox.stub(request, 'post');
    postStub.withArgs(sinon.match('mappings')).callsFake(
      (uri, opts, cb) => cb(undefined, { statusCode: mappingsStatusCode })
    );
    postStub.callsFake((uri, opts, cb) => cb(errorMessage, { statusCode: statusCode }));

    serviceMappingClientStub = {
      createServiceMapping: sandbox.stub().callsFake(async () => {})
    };

    provisioningClientStub = {
      createMeteringPlan: sandbox.stub().callsFake(async () => {}),
      createPricingPlan: sandbox.stub().callsFake(async () => {}),
      createRatingPlan: sandbox.stub().callsFake(async () => {}),
      mapMeteringPlan: sandbox.stub().callsFake(async () => {}),
      mapPricingPlan: sandbox.stub().callsFake(async () => {}),
      mapRatingPlan: sandbox.stub().callsFake(async () => {})
    };

    createService = require('../../routes/create-service.js')(serviceMappingClientStub, provisioningClientStub);
  });

  context('when error', () => {

    it('500 is returned during plan creation, it should fail ', (done) => {
      provisioningClientStub.createMeteringPlan.callsFake(async () => {
        throw new APIError(httpStatus.INTERNAL_SERVER_ERROR);
      });
      createService.createPlans(planConfig, (statusCode) => {
        expect(statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
        done();
      });
    });

    it('404 is returned during plan creation, it should fail', (done) => {
      provisioningClientStub.createMeteringPlan.callsFake(async () => {
        throw new APIError(httpStatus.NOT_FOUND);
      });
      createService.createPlans(planConfig, (statusCode) => {
        expect(statusCode).to.equal(httpStatus.NOT_FOUND);
        done();
      });
    });

    it('400 is returned during creation of plan mapping, it should fail', (done) => {
      provisioningClientStub.mapMeteringPlan.callsFake(async () => {
        throw new APIError(httpStatus.BAD_REQUEST);
      });
      createService.createPlans(planConfig, (statusCode) => {
        expect(statusCode).to.equal(httpStatus.BAD_REQUEST);
        done();
      });
    });
  });

  context('when createService is called', () => {

    const sampleMeteringPlan = meteringPlan(formattedPlanId);

    const resProvider = {
      service_name: 'test_service_name',
      service_plan_name: 'test_plan_name'
    };

    context('plans and mappings are created', () => {

      beforeEach((done) => {
        createService.createPlans(planConfig, (statusCode) => {
          expect(statusCode).to.equal(httpStatus.CREATED);
          done();
        });
      });

      const samplePricingPlan = {
        plan_id: formattedPlanId,
        metrics: [{
          name: 'sampleName',
          prices: [{
            country: 'sampleCountry',
            price: 0
          }]
        }]
      };

      const sampleRatingPlan = {
        plan_id: formattedPlanId,
        metrics: [{
          name: 'sampleName'
        }]
      };

      it('metering plan should be created', () => {
        assert.calledWith(provisioningClientStub.createMeteringPlan,
          sampleMeteringPlan
        );
      });

      it('pricing plan should be created', () => {
        assert.calledWith(provisioningClientStub.createPricingPlan,
          samplePricingPlan
        );
      });

      it('rating plan should be created', () => {
        assert.calledWith(provisioningClientStub.createRatingPlan,
          sampleRatingPlan
        );
      });

      it('metering plan mapping should be created', () => {
        assert.calledWith(provisioningClientStub.mapMeteringPlan,
          testInstanceId, config.defaultPlanName, formattedPlanId
        );
      });

      it('pricing plan mapping should be created', () => {
        assert.calledWith(provisioningClientStub.mapPricingPlan,
          testInstanceId, config.defaultPlanName, formattedPlanId
        );
      });

      it('rating plan mapping should be created', () => {
        assert.calledWith(provisioningClientStub.mapRatingPlan,
          testInstanceId, config.defaultPlanName, formattedPlanId
        );
      });
    });

    context('custom metering plan is provided', () => {

      const meteringPlan = {
        plan_id: 'test',
        measures: [
          {
            name: 'classifiers',
            unit: 'INSTANCE'
          }
        ],
        metrics: [
          {
            name: 'classifier_instances',
            unit: 'INSTANCE',
            type: 'discrete',
            formula: 'AVG({classifier})'
          }
        ]
      };

      const generateCustomPlans = (resourceProvider) => {
        const result = {
          plan: meteringPlan
        };

        if (resourceProvider)
          extend(result, { resource_provider: resourceProvider });

        return { plans: [result] };
      };

      before(() => {
        planConfig.parameters = generateCustomPlans();

        statusCode = httpStatus.CREATED;
        mappingsStatusCode = httpStatus.OK;
        errorMessage = undefined;
      });

      afterEach(() => {
        postStub.reset();
      });

      it('should succeed', (done) => {
        createService.createPlans(planConfig, (statusCode) => {
          expect(statusCode).to.equal(httpStatus.CREATED);
          const planId = config.generatePlanId(planConfig.instance_id,
            planConfig.instance_id);
          const expectedMeteringPlan = extend({}, meteringPlan, {
            plan_id: planId });
          const expectedPricingPlan = {
            plan_id : planId,
            metrics : [
              {
                name: 'classifier_instances',
                prices : [
                  {
                    country : 'sampleCountry',
                    price : 0
                  }
                ]
              }
            ]
          };
          const expectedRatingPlan = {
            plan_id: planId,
            metrics: [
              {
                name: 'classifier_instances'
              }
            ]
          };

          assert.calledWith(provisioningClientStub.createMeteringPlan,
            expectedMeteringPlan
          );
          assert.calledWith(provisioningClientStub.createPricingPlan,
            expectedPricingPlan
          );
          assert.calledWith(provisioningClientStub.createRatingPlan,
            expectedRatingPlan
          );
          done();
        });
      });

      context('when resource provider property is supplied', () => {
        const planId = `standard/${testInstanceId}-${testInstanceId}/` +
        `${testInstanceId}-${testInstanceId}/${testInstanceId}-${testInstanceId}`;

        before(() => {
          planConfig.parameters = generateCustomPlans(resProvider);
          planConfig.organization_guid = testOrgGuid;
          planConfig.space_guid = testSpaceGuid;

          statusCode = httpStatus.CREATED;
          mappingsStatusCode = httpStatus.OK;
          errorMessage = undefined;


        });

        it('should successfully post to mapping API', (done) => {
          createService.createPlans(planConfig, (statusCode) => {
            expect(statusCode).to.equal(httpStatus.CREATED);

            const expectedBody = {
              organization_guid: testOrgGuid,
              space_guid: testSpaceGuid,
              service_name: 'test_service_name',
              service_plan_name: 'test_plan_name'
            };

            assert.calledWith(serviceMappingClientStub.createServiceMapping,
              testInstanceId, planId, expectedBody);
            done();
          });
        });

        it('should fail when error occurs in service mapping API', (done) => {
          serviceMappingClientStub.createServiceMapping.callsFake(async() => {
            throw new APIError(httpStatus.BAD_REQUEST);
          });

          createService.createPlans(planConfig, (statusCode) => {
            expect(statusCode).to.equal(httpStatus.BAD_REQUEST);
            assert.calledOnce(serviceMappingClientStub.createServiceMapping);
            done();
          });
        });
      });
    });

    context('custom configuration is not provided', () => {
      it('should fail when only resourceProvider is available', (done) => {
        planConfig.parameters = { plans: [{ resource_provider: resProvider }] };
        createService.createPlans(planConfig, (statusCode, body) => {
          expect(statusCode).to.equal(httpStatus.BAD_REQUEST);
          expect(body).to.equal('Invalid service configuration.');
          expect(postStub.callCount).to.equal(0);
          done();
        });
      });
    });
  });

  context('when createService is called with invalid plan', () => {

    before (() => {
      planConfig.parameters = { not: 'valid' };
    });

    it('should fail with appropriate error', (done) => {
      createService.createPlans(planConfig, (statusCode, body) => {
        expect(statusCode).to.equal(httpStatus.BAD_REQUEST);
        expect(body).to.equal('Invalid service configuration.');
        done();
      });
    });
  });

  context.skip('validating dashboard url', () => {
    const testInstanceId = 'f659d315-953c-4ab3-9e64-14b53ea7214a';
    const testBrokerUser = 'broker_user';
    const testBrokerPassword = 'broker_password';
    let server;

    before(() => {
      process.env.BROKER_USER = testBrokerUser;
      process.env.BROKER_PASSWORD = testBrokerPassword;

      const broker = require('../..');
      const app = broker();
      server = app.listen(0);
    });

    after(() => {
      delete process.env.BROKER_USER;
      delete process.env.BROKER_PASSWORD;

      if (server)
        server.close();
    });

    const requestConfig = (port) => {
      return {
        p: port,
        instance_id: testInstanceId,
        headers: {
          Authorization:
            'Basic ' + new Buffer(testBrokerUser + ':' + testBrokerPassword).toString('base64')
        }
      };
    };

    it('should not return dashboard url, when plans are not created', (done) => {
      statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      mappingsStatusCode = httpStatus.INTERNAL_SERVER_ERROR;

      request.put('http://localhost::p/v2/service_instances/:instance_id',
        requestConfig(server.address().port), (err, res) => {
          expect(err.statusCode).to.equals(httpStatus.INTERNAL_SERVER_ERROR);
          expect(res).to.equal(undefined);
          done();
        });
    });

    it('should return dashboard url, when plans are created', (done) => {
      statusCode = httpStatus.CREATED;
      mappingsStatusCode = httpStatus.OK;

      request.put('http://localhost::p/v2/service_instances/:instance_id',
        requestConfig(server.address().port), (err, res) => {
          expect(err).to.equal(undefined);
          expect(res.statusCode).to.equals(httpStatus.CREATED);
          const expectedBody = { dashboard_url: `/${testInstanceId}` };
          expect(res.body).to.deep.equal(expectedBody);
          done();
        });
    });
  });
});
