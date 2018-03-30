'use strict';

/* eslint-disable no-unused-expressions */

const { extend } = require('underscore');

const httpStatus = require('http-status-codes');
const oauth = require('abacus-oauth');
const request = require('abacus-request');

describe('Update service instance', () => {
  const sandbox = sinon.sandbox.create();

  const putStub = sandbox.stub(request, 'put');

  const token = 'Bearer abc';
  sandbox.stub(oauth, 'cache').callsFake(() => {
    const f = () => token;
    f.start = (cb) => cb();

    return f;
  });

  afterEach(() => {
    putStub.reset();
  });

  const testInstanceId = 'f659d315-953c-4ab3-9e64-14b53ea7214a';
  const testBrokerUser = 'broker_user';
  const testBrokerPassword = 'broker_password';
  let server;

  const requestOptions = (port, body) => {
    return {
      p: port,
      instance_id: testInstanceId,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + new Buffer(testBrokerUser + ':' + testBrokerPassword).toString('base64')
      },
      body
    };
  };

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
    sandbox.restore();
  });

  context('when service configuration parameters are provided', () => {

    const planId = `${testInstanceId}-${testInstanceId}`;
    const dummyPlanId = 'dummy_plan_id';

    const meteringPlanConfiguration = (planId, resourceProvider) => {
      const config = {
        plans: [{
          plan: {
            plan_id: planId,
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
          }
        }]
      };

      if (resourceProvider)
        config.plans[0].resource_provider = resourceProvider;

      return config;
    };

    const pricingPlanBody = {
      plan_id: planId,
      metrics: [{
        name: 'classifier_instances',
        prices: [
          {
            country: 'sampleCountry',
            price: 0
          }
        ]
      }]
    };

    const ratingPlanBody = {
      plan_id: planId,
      metrics: [{
        name: 'classifier_instances'
      }]
    };

    const createBody = (params, opts) => extend({ service_id: 'guid', parameters: params }, opts || {});

    context('when custom metering plan is provided', () => {
      const provisioningUrl = 'http://localhost:9880';
      const headers = { authorization: token };
      const uri = ':provisioning_url/v1/:plan_type/plan/:plan_id';

      beforeEach(() => {
        putStub.yields(undefined, { statusCode: httpStatus.OK });
      });

      it('should update the plans in the provisioning plugin', (done) => {
        request.patch(
          'http://localhost::p/v2/service_instances/:instance_id',
          requestOptions(server.address().port, createBody(meteringPlanConfiguration(dummyPlanId))),
          (err, res) => {
            expect(err).to.equals(undefined);
            expect(res.statusCode).to.equal(httpStatus.OK);
            expect(res.body).to.deep.equal({});
            expect(putStub.callCount).to.equal(3);
            assert.calledWith(putStub.firstCall, uri,
              {
                body: createBody(meteringPlanConfiguration(planId)).parameters.plans[0].plan,
                provisioning_url: provisioningUrl,
                headers: headers,
                plan_id: planId,
                plan_type: 'metering'
              });
            assert.calledWith(putStub.secondCall, uri,
              {
                body: pricingPlanBody,
                provisioning_url: provisioningUrl,
                headers: headers,
                plan_id: planId,
                plan_type: 'pricing'
              });
            assert.calledWith(putStub.thirdCall, uri, {
              body: ratingPlanBody,
              provisioning_url: provisioningUrl,
              headers: headers,
              plan_id: planId,
              plan_type: 'rating'
            });

            done();
          });
      });

      context('and resource provider property is supplied', () => {
        const orgGuid = 'org-abcd-1234';
        const spaceGuid = 'space-1234-abcd';
        const testServiceName = 'test_service_name';
        const servicePlanName = 'service_plan_name';

        const meteringPlanConfig = meteringPlanConfiguration(dummyPlanId, {
          service_name: testServiceName,
          service_plan_name: servicePlanName
        });
        const planConfig = createBody(meteringPlanConfig, {
          organization_guid: orgGuid,
          space_guid: spaceGuid
        });

        context('when service mapping succeeds', () => {
          const encodedPlanId = `standard%2F${testInstanceId}-${testInstanceId}%2F` +
            `${testInstanceId}-${testInstanceId}%2F${testInstanceId}-${testInstanceId}`;

          it('should succeed post to mapping API first', (done) => {
            request.patch(
              'http://localhost::p/v2/service_instances/:instance_id',
              requestOptions(server.address().port, planConfig),
              (err, res) => {
                expect(err).to.equals(undefined);
                expect(res.statusCode).to.equal(httpStatus.OK);
                expect(res.body).to.deep.equal({});

                const expectedBody = {
                  organization_guid: orgGuid,
                  space_guid: spaceGuid,
                  service_name: testServiceName,
                  service_plan_name: servicePlanName
                };

                expect(putStub.callCount).to.equal(4);
                assert.calledWith(putStub.firstCall, sinon.match.any,
                  sinon.match({
                    body: expectedBody,
                    plan: encodedPlanId,
                    resource: testInstanceId
                  }));
                done();
              });
          });
        });

        context('when error occurs in service mapping API', () => {
          beforeEach(() => {
            putStub.yields(undefined, { statusCode: httpStatus.INTERNAL_SERVER_ERROR });
          });

          it('should fail', (done) => {
            request.patch(
              'http://localhost::p/v2/service_instances/:instance_id',
              requestOptions(server.address().port, planConfig),
              (err, res) => {
                expect(err).not.to.equals(undefined);
                expect(putStub.callCount).to.equal(1);
                done();
              }
            );
          });
        });
      });
    });

    it('should fail with empty plans', (done) => {
      const error = 'empty_plan';
      const code = httpStatus.BAD_REQUEST;

      putStub.yields(undefined, { statusCode: code, body: error });

      request.patch('http://localhost::p/v2/service_instances/:instance_id',
        requestOptions(server.address().port, createBody({
          plans: []
        })),
        (err, res) => {
          expect(err).to.be.undefined;
          expect(res.statusCode).to.equal(httpStatus.BAD_REQUEST);
          expect(res.body).to.eql({
            description: 'Invalid service configuration.'
          });
          expect(putStub.called).to.be.false;
          done();
        });
    });

    context('when business error in provisioning while update ', () => {

      it('when updating metering plan fails, it should propagate the error',
        (done) => {
          const error = { error: 'missing required field plan_id' };
          const code = httpStatus.BAD_REQUEST;

          putStub.yields(undefined, { statusCode: code, body: error });

          request.patch('http://localhost::p/v2/service_instances/:instance_id',
            requestOptions(server.address().port, createBody({
              plans: [{ plan: { key: 'invalid_plan' } }]
            })),
            (err, res) => {
              expect(err).to.be.undefined;
              expect(res.statusCode).to.equal(code);
              expect(res.body).to.eql({
                description: JSON.stringify(error)
              });
              expect(putStub.callCount).to.equal(1);
              done();
            });
        });

      it('when updating pricing plan fails, it should return httpStatus.INTERNAL_SERVER_ERROR', (done) => {
        putStub.onFirstCall().yields(undefined, { statusCode: httpStatus.OK });
        putStub.onSecondCall().yields(undefined, { statusCode: httpStatus.BAD_REQUEST });

        request.patch('http://localhost::p/v2/service_instances/:instance_id',
          requestOptions(
            server.address().port,
            createBody(meteringPlanConfiguration(planId))
          ), (err, res) => {
            expect(err).to.instanceOf(Error);
            expect(err.statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
            assert.calledTwice(putStub);
            done();
          });
      });

      it('when updating rating plan fails, it should return httpStatus.INTERNAL_SERVER_ERROR', (done) => {
        putStub.onFirstCall().yields(undefined, { statusCode: httpStatus.OK });
        putStub.onSecondCall().yields(undefined, { statusCode: httpStatus.OK });
        putStub.onThirdCall().yields(undefined, { statusCode: httpStatus.BAD_REQUEST });

        request.patch('http://localhost::p/v2/service_instances/:instance_id',
          requestOptions(
            server.address().port,
            createBody(meteringPlanConfiguration(planId))
          ), (err, res) => {
            expect(err).to.instanceOf(Error);
            expect(err.statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
            assert.calledThrice(putStub);
            done();
          });
      });
    });

    it('should fail in case of error in provisioning', (done) => {
      const error = new Error('some_error');
      error.statusCode = 502;

      putStub.yields(error);

      request.patch('http://localhost::p/v2/service_instances/:instance_id',
        requestOptions(
          server.address().port,
          createBody(meteringPlanConfiguration(planId))
        ), (err, res) => {
          expect(err).to.instanceOf(Error);
          expect(err.statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
          expect(putStub.called).to.be.true;
          done();
        });
    });
  });

  context('when service configuration parameters are missing', () => {
    it('should succeed without calling provisioning', (done) => {

      request.patch('http://localhost::p/v2/service_instances/:instance_id',
        requestOptions(server.address().port, {}), (err, res) => {
          expect(err).to.equals(undefined);
          expect(res.statusCode).to.equal(httpStatus.OK);
          expect(res.body).to.deep.equal({});
          expect(putStub.called).to.be.false;
          done();
        });
    });
  });
});
