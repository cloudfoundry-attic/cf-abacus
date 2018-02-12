'use strict';

const httpStatus = require('http-status-codes');

const _ = require('underscore');
const extend = _.extend;

const request = require('abacus-request');

const config = require('../config.js');
const meteringPlan = require('../plans/metering.js');

describe('Create service instance', () => {
  const sandbox = sinon.sandbox.create();

  let postStub;
  let statusCode;
  let mappingsStatusCode;
  let errorMessage;
  let createService;

  const testInstanceId = 'testInstanceId';
  const testServiceId = 'testServiceId';
  const testOrgGuid = '34kj34kj-0be6-45f3-a1f0-1d3fe41db4dd';
  const testSpaceGuid = '12hg12hg-c3cb-4bc1-ac74-f9bf4d9df83c';
  const encodedPlanId = `standard%2F${testInstanceId}-${testInstanceId}%2F` +
    `${testInstanceId}-${testInstanceId}%2F${testInstanceId}-${testInstanceId}`;
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
    postStub.withArgs(sinon.match('mappings'))
      .callsFake((uri, opts, cb) => cb(undefined,
        { statusCode: mappingsStatusCode }));
    postStub
      .callsFake((uri, opts, cb) => cb(errorMessage,
        { statusCode: statusCode }));

    createService = require('../routes/create-service.js');
  });

  context('when error', () => {

    const validateErrorInPlansCreation = (callCount, done) =>
      createService.createPlans(planConfig, (statusCode) => {
        expect(statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
        expect(postStub.callCount).to.equal(callCount);
        done();
      });

    it('500 is retured during plan creation, it should fail ', (done) => {
      statusCode = httpStatus.INTERNAL_SERVER_ERROR;
      mappingsStatusCode = httpStatus.OK;
      errorMessage = 'Error';

      validateErrorInPlansCreation(1, done);
    });

    it('404 is retured during plan creation, it should fail', (done) => {
      statusCode = httpStatus.NOT_FOUND;
      errorMessage = undefined;

      validateErrorInPlansCreation(1, done);
    });

    it('in first create of plan mapping occurs, it should fail', (done) => {
      statusCode = httpStatus.CREATED;
      mappingsStatusCode = httpStatus.BAD_REQUEST;
      errorMessage = undefined;

      validateErrorInPlansCreation(4, done);
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
        statusCode = httpStatus.CREATED;
        mappingsStatusCode = httpStatus.OK;
        errorMessage = null;

        createService.createPlans(planConfig, (statusCode) => {
          expect(statusCode).to.equal(httpStatus.CREATED);
          expect(postStub.callCount).to.equal(6);
          done();
        });
      });

      const meteringRequestParameters = {
        plan_id: formattedPlanId,
        resource_id: testInstanceId,
        plan_name: config.defaultPlanName
      };

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

      const itShouldCreate = (name, callIndex, requestParameters) => {
        it(`${name} should be created`, () => {
          expect(
            postStub.getCall(callIndex).calledWithMatch(sinon.match.any, requestParameters)
          ).to.equal(true);
        });
      };

      [ { 'metering plan': { body: sampleMeteringPlan } },
        { 'pricing plan': { body: samplePricingPlan } },
        { 'rating plan': { body: sampleRatingPlan } },
        { 'metering mapping': meteringRequestParameters },
        { 'pricing mapping': meteringRequestParameters },
        { 'rating mapping': meteringRequestParameters }
      ].forEach((value, idx) => {
        const name = Object.keys(value)[0];
        itShouldCreate(name, idx, value[name]);
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
          const expectePricingPlan = {
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
          assert.calledWith(postStub.firstCall, sinon.match.any,
            sinon.match({ body: expectedMeteringPlan }));
          assert.calledWith(postStub.secondCall, sinon.match.any,
            sinon.match({ body:  expectePricingPlan }));
          assert.calledWith(postStub.thirdCall, sinon.match.any,
            sinon.match({ body:  expectedRatingPlan }));
          done();
        });
      });

      context('and resource provider property is supplied', () => {

        before(() => {
          planConfig.parameters = generateCustomPlans(resProvider);
          planConfig.organization_guid = testOrgGuid;
          planConfig.space_guid = testSpaceGuid;

          statusCode = httpStatus.CREATED;
          mappingsStatusCode = httpStatus.OK;
          errorMessage = undefined;
        });

        it('should succeed post to mapping API first', (done) => {
          createService.createPlans(planConfig, (statusCode) => {
            expect(statusCode).to.equal(httpStatus.CREATED);

            const expectedBody = {
              organization_guid: testOrgGuid,
              space_guid: testSpaceGuid,
              service_name: 'test_service_name',
              service_plan_name: 'test_plan_name'
            };
            assert.calledWith(postStub.firstCall, sinon.match.any,
              sinon.match({ body: expectedBody, plan: encodedPlanId,
                resource: testInstanceId }));
            done();
          });
        });

        it('should fail when error occurs in service mapping API', (done) => {
          mappingsStatusCode = httpStatus.BAD_REQUEST;

          createService.createPlans(planConfig, (statusCode) => {
            expect(statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
            expect(postStub.callCount).to.equal(1);
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

  context('validating dashboard url', () => {
    const testInstanceId = 'f659d315-953c-4ab3-9e64-14b53ea7214a';
    const testBrokerUser = 'broker_user';
    const testBrokerPassword = 'broker_password';
    let server;

    before(() => {
      const cluster = require('abacus-cluster');
      require.cache[require.resolve('abacus-cluster')].exports =
        extend((app) => app, cluster);

      process.env.BROKER_USER = testBrokerUser;
      process.env.BROKER_PASSWORD = testBrokerPassword;

      const broker = require('..');
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
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' + new Buffer(testBrokerUser + ':' + testBrokerPassword)
            .toString('base64')
        }
      };
    };

    it('should not return dashborad url, when plans are not created',
      (done) => {
        statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        mappingsStatusCode = httpStatus.INTERNAL_SERVER_ERROR;

        request.put('http://localhost::p/v2/service_instances/:instance_id',
          requestConfig(server.address().port), (err, res) => {
            expect(err.statusCode).to.equals(httpStatus.INTERNAL_SERVER_ERROR);
            expect(res).to.equal(undefined);
            done();
          });
      });

    it('should return dashborad url, when plans are created', (done) => {
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
