'use strict';

const _ = require('underscore');
const extend = _.extend;

const request = require('abacus-request');
const cluster = require('abacus-cluster');
const utils = require('./utils.js');

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

describe('abacus-provisioning-plugin updating', () => {

  const resourceId = '6023c670-8337-4254-bd05-774048942df6';

  const meteringPlan = {
    plan_id: `test-metering-plan-${resourceId}`,
    measures: [{
      name: 'classifiers-updated',
      unit: 'INSTANCE'
    }],
    metrics: [{
      name: 'classifier_instances',
      unit: 'INSTANCE',
      type: 'discrete',
      formula: 'AVG({classifier})'
    }]
  };

  const pricingPlan = {
    plan_id: `test-pricing-plan-${resourceId}`,
    metrics: [{
      name: 'classifier_instances',
      prices: [{
        country: 'USA',
        price: 0.00015
      }, {
        country: 'EUR',
        price: 0.00011
      }, {
        country: 'CAN',
        price: 0.00016
      }]
    }]
  };

  const ratingPlan = {
    plan_id: `test-rating-plan-${resourceId}`,
    metrics: [{
      name: 'classifier_instances',
      rate: ((p,qty) => p ? p * qty : 0).toString(),
      charge: ((t,cost) => cost).toString()
    }]
  };

  let server;
  let dbclient;
  let getFromDbMock;
  let putToDbMock = spy((doc, cb) => {
    return cb(undefined, {});
  });

  const mockDbClient = () => {
    dbclient = require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
    dbclientModule.exports = extend(() => {
      return {
        fname: 'test-mock',
        get: (id, cb) => {
          return getFromDbMock(id, cb);
        },
        put: putToDbMock
      };
    }, dbclient);
  };

  before(() => {
    mockDbClient();
  });

  beforeEach(() => {
    putToDbMock.reset();
  });

  after(() => {
    delete require.cache[require.resolve('abacus-dbclient')];
  });

  const requestPlan = (headers, resourceType, planId, requestBody,
    expectation) => {
    request.put('http://localhost::port/v1/:resource_type/plan/:plan_id', {
      port: server.address().port,
      resource_type: resourceType,
      plan_id: planId,
      body: requestBody,
      headers: headers
    }, function(err, response) {
      expectation(err, response);
    });
  };

  const expectStatusCodeOK = (err, response, dbDoc) => {
    expect(err).to.equal(undefined);
    expect(response.statusCode).to.equal(200);
    expect(getFromDbMock.callCount).to.equal(1);
    expect(putToDbMock.callCount).to.equal(1);
    assert.calledWith(putToDbMock, dbDoc);
  };

  const expectStatusCodeBadRequest = (err, response, dbDoc) => {
    expect(err).to.equal(undefined);
    expect(response.statusCode).to.equal(400);
    expect(getFromDbMock.callCount).to.equal(0);
    expect(putToDbMock.callCount).to.equal(0);
  };

  const expectStatusCodeNotFound = (err, response, dbDoc) => {
    expect(err).to.equal(undefined);
    expect(response.statusCode).to.equal(404);
    expect(response.body.message).to.equal('Plan not found');
    expect(putToDbMock.callCount).to.equal(0);
  };

  const testUpdatePlan = (planType, plan, headers = {}) => {

    const planDbDoc = extend({}, plan, {
      _id: `k/test-${planType}-plan-${resourceId}`,
      _rev: 1
    });

    context(`${planType} plan`, () => {

      it('succeeds', (done) => {
        getFromDbMock = spy(function(id, cb) {
          return cb(undefined, planDbDoc);
        });

        requestPlan(headers, planType, plan.plan_id, plan,
          (err, response) => {
            expectStatusCodeOK(err, response, planDbDoc);
            done();
          });
      });

      it('fails with invalid request body', (done) => {
        getFromDbMock = spy(function(id, cb) {
          return cb(undefined, planDbDoc);
        });

        requestPlan(headers, planType, plan.plan_id, {},
          (err, response) => {
            expectStatusCodeBadRequest(err, response, planDbDoc);
            done();
          });
      });

      it('fails when plan does not exist', (done) => {
        getFromDbMock = spy(function(id, cb) {
          return cb(null, undefined);
        });

        requestPlan(headers, planType, plan.plan_id, plan,
          (err, response) => {
            expectStatusCodeNotFound(err, response, planDbDoc);
            done();
          });
      });

    });

  };

  const startProvisioning = () => {
    delete require.cache[require.resolve('..')];

    const provisioning = require('..');
    server = provisioning().listen(0);
  };

  context('not secured', () => {

    before(() => {
      process.env.SECURED = false;

      startProvisioning();
    });

    testUpdatePlan('metering', meteringPlan);
    testUpdatePlan('pricing', pricingPlan);
    testUpdatePlan('rating', ratingPlan);

  });

  context('secured', () => {

    before(() => {
      process.env.SECURED = true;
      process.env.JWTKEY = utils.TOKEN_SECRET;
      process.env.JWTALGO = 'HS256';

      startProvisioning();
    });

    context('when system scope is provided', () => {

      testUpdatePlan('metering', meteringPlan,
        utils.getSystemWriteAuthorization());

      testUpdatePlan('pricing', pricingPlan,
        utils.getSystemWriteAuthorization());

      testUpdatePlan('rating', ratingPlan,
        utils.getSystemWriteAuthorization());

    });

    context('when resource specific scope is provided', () => {

      testUpdatePlan('metering', meteringPlan,
        utils.getResourceWriteAuthorization(resourceId));

      testUpdatePlan('pricing', pricingPlan,
        utils.getResourceWriteAuthorization(resourceId));

      testUpdatePlan('rating', ratingPlan,
        utils.getResourceWriteAuthorization(resourceId));

      it('update metering plan when dummy plan id is provided in url',
        (done) => {
          requestPlan(utils.getResourceWriteAuthorization(resourceId),
            'metering', 'dummy_plan_id', meteringPlan, (err, res) => {
              expect(err).to.equal(undefined);
              expect(res.statusCode).to.equal(400);
              done();
            });
        });

      it('update metering plan when dummy plan id is provided in metering plan',
        (done) => {
          const modifiedMeteringPlan = extend({}, meteringPlan,
            { plan_id:'dummy' });

          requestPlan(utils.getResourceWriteAuthorization(resourceId),
            'metering', `test-metering-plan-${resourceId}`,
            modifiedMeteringPlan, (err, res) => {
              expect(err).to.equal(undefined);
              expect(res.statusCode).to.equal(400);
              done();
            });
        });

    });

  });

});
