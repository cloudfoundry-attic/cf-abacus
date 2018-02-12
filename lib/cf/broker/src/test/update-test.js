'use strict';

/* eslint-disable no-unused-expressions */

const _ = require('underscore');
const extend = _.extend;

const request = require('abacus-request');

const oauth = require('abacus-oauth');

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
        Authorization:
          'Basic ' + new Buffer(testBrokerUser + ':' + testBrokerPassword)
          .toString('base64')
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
    const dummyPlanId = 'dymmy_plan_id';

    const meteringPlanConfiguration = (planId) => ({
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
    });

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

    const createBody = (params = meteringPlanConfiguration(planId)) => ({
      service_id: 'guid',
      parameters: params
    });

    it('should update the plans in the provisiong plugin', (done) => {
      putStub.yields(undefined, { statusCode: 200 });

      const provisioningUrl = 'http://localhost:9880';
      const headers = { authorization: token };
      const uri = ':provisioning_url/v1/:plan_type/plan/:plan_id';

      request.patch('http://localhost::p/v2/service_instances/:instance_id',
        requestOptions(server.address().port,
          createBody(meteringPlanConfiguration(dummyPlanId))), (err, res) => {
          expect(err).to.equals(undefined);
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.deep.equal({});
          expect(putStub.callCount).to.equal(3);
          assert.calledWith(putStub.firstCall, uri,
            { body: createBody().parameters.plans[0].plan,
              provisioning_url: provisioningUrl,
              headers: headers,
              plan_id: planId,
              plan_type: 'metering'
            });
          assert.calledWith(putStub.secondCall, uri,
            { body: pricingPlanBody,
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

    it('should fail with empty plans', (done) => {
      const error = 'empty_plan';
      const code = 400;

      putStub.yields(undefined, { statusCode: code, body: error });

      request.patch('http://localhost::p/v2/service_instances/:instance_id',
        requestOptions(server.address().port, createBody({
          plans: []
        })),
        (err, res) => {
          expect(err).to.be.undefined;
          expect(res.statusCode).to.equal(400);
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
          const code = 400;

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

      it('when updating pricing plan fails, it should return 500', (done) => {
        putStub.onFirstCall().yields(undefined, { statusCode: 200 });
        putStub.onSecondCall().yields(undefined, { statusCode: 400 });

        request.patch('http://localhost::p/v2/service_instances/:instance_id',
          requestOptions(server.address().port, createBody()),
          (err, res) => {
            expect(err).to.instanceOf(Error);
            expect(err.statusCode).to.equal(500);
            assert.calledTwice(putStub);
            done();
          });
      });

      it('when updating rating plan fails, it should return 500', (done) => {
        putStub.onFirstCall().yields(undefined, { statusCode: 200 });
        putStub.onSecondCall().yields(undefined, { statusCode: 200 });
        putStub.onThirdCall().yields(undefined, { statusCode: 400 });

        request.patch('http://localhost::p/v2/service_instances/:instance_id',
          requestOptions(server.address().port, createBody()),
          (err, res) => {
            expect(err).to.instanceOf(Error);
            expect(err.statusCode).to.equal(500);
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
        requestOptions(server.address().port, createBody()), (err, res) => {
          expect(err).to.instanceOf(Error);
          expect(err.statusCode).to.equal(500);
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
          expect(res.statusCode).to.equal(200);
          expect(res.body).to.deep.equal({});
          expect(putStub.called).to.be.false;
          done();
        });
    });
  });
});
