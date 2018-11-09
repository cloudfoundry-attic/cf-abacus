'use strict';

const _ = require('underscore');
const extend = _.extend;
const omit = _.omit;

const request = require('abacus-request');
const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');
const partition = require('abacus-partition');
const utils = require('./utils.js');

let provisioning;
let server;

const resourceId = '6023c670-8337-4254-bd05-774048942df6';

const uris = urienv({
  DB: 27017
});

require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const meteringdb = yieldable(dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-metering-plans')));
const pricingdb = yieldable(dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-pricing-plans')));
const ratingdb = yieldable(dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-rating-plans')));

const startProvisioning = () => {
  delete require.cache[require.resolve('..')];
  delete require.cache[require.resolve('../lib/plan-db.js')];

  provisioning = require('..');
  server = provisioning().listen(0);
};

const postRequest = (headers, planType, plan, verifyCb) => {
  request.post(
    'http://localhost::p/v1/:plan_type/plans', {
      p: server.address().port,
      plan_type: planType,
      body: plan,
      headers: headers
    }, (err, val) => {
      expect(err).to.equal(undefined);
      verifyCb(val);
    });
};

const meteringPlan = (prefix = '') => ({
  plan_id: `${prefix}metering-plan-id-${resourceId}`,
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
});

const pricingPlan = (prefix = '') => ({
  plan_id: `${prefix}pricing-plan-id-${resourceId}`,
  metrics: [
    {
      name: 'classifier',
      prices: [
        {
          country: 'USA',
          price: 0.00015
        },
        {
          country: 'EUR',
          price: 0.00011
        },
        {
          country: 'CAN',
          price: 0.00016
        }]
    }
  ]
});

const ratingPlan = (prefix = '') => ({
  plan_id: `${prefix}rating-plan-id-${resourceId}`,
  metrics: [
    {
      name: 'classifier',
      rate: ((price, qty) => new BigNumber(price || 0)
        .mul(qty).toNumber()).toString()
    }
  ]
});

const testPostOfPlan = (headers, planType, plan, db) => {

  it(`validates creation of new ${planType} plan and errors on dupplicate`,
    (done) => {
      postRequest(headers, planType, plan, (val) => {
        expect(val.statusCode).to.equal(201);

        yieldable.functioncb(function*() {
          const planInDb = yield db.get(['k', plan.plan_id].join('/'));
          expect(omit(planInDb, 'id', '_id', '_rev')).to.deep.equal(plan);
        })((error) => {
          if(error)
            throw error;

          postRequest(headers, planType, plan, (val) => {
            expect(val.statusCode).to.equal(409);
            done();
          });
        });
      });
    });

  it(`validate post of empty ${planType} plan`, (done) => {
    postRequest(headers, planType, {}, (val) => {
      expect(val.statusCode).to.equal(400);
      done();
    });
  });

};

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('Test plans', () => {

  context('when not secured', () => {

    before(() => {
      process.env.SECURED = false;

      startProvisioning();
    });

    after((done) => {
      dbclient.drop(dbEnv, /^abacus-rating-plan|^abacus-pricing-plan|^abacus-metering-plan/, done);
    });

    context('abacus-provisioning-plugin create metering plan',
      () => testPostOfPlan({}, 'metering', meteringPlan(), meteringdb));

    context('abacus-provisioning-plugin create pricing plan',
      () => testPostOfPlan({}, 'pricing', pricingPlan(), pricingdb));

    context('abacus-provisioning-plugin create rating plan',
      () => testPostOfPlan({}, 'rating', ratingPlan(), ratingdb));

  });

  context('when secured', () => {

    before(() => {
      process.env.SECURED = true;
      process.env.JWTKEY = utils.TOKEN_SECRET;
      process.env.JWTALGO = 'HS256';

      startProvisioning();
    });

    after((done) => {
      dbclient.drop(dbEnv, /^abacus-rating-plan|^abacus-pricing-plan|^abacus-metering-plan/, done);
    });

    context('and system scope is provided', () => {

      context('abacus-provisioning-plugin create metering plan',
        () => testPostOfPlan(utils.getSystemWriteAuthorization(), 'metering',
          meteringPlan(), meteringdb));

      context('abacus-provisioning-plugin create pricing plan',
        () => testPostOfPlan(utils.getSystemWriteAuthorization(), 'pricing',
          pricingPlan(), pricingdb));

      context('abacus-provisioning-plugin create rating plan',
        () => testPostOfPlan(utils.getSystemWriteAuthorization(), 'rating',
          ratingPlan(), ratingdb));

    });

    context('and resource specific scope is provided', () => {

      context('abacus-provisioning-plugin create metering plan',
        () => testPostOfPlan(utils.getResourceWriteAuthorization(resourceId),
          'metering', meteringPlan('res-'), meteringdb));

      context('abacus-provisioning-plugin create pricing plan',
        () => testPostOfPlan(utils.getResourceWriteAuthorization(resourceId),
          'pricing', pricingPlan('res-'), pricingdb));

      context('abacus-provisioning-plugin create rating plan',
        () => testPostOfPlan(utils.getResourceWriteAuthorization(resourceId),
          'rating', ratingPlan('res-'), ratingdb));

    });

  });

});
