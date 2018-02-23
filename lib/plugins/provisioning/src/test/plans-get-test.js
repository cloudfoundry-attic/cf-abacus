'use strict';

const _ = require('underscore');
const extend = _.extend;

const request = require('abacus-request');
const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');
const partition = require('abacus-partition');
const utils = require('./utils.js');

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

const uris = urienv({
  db: 5984
});

const resourceId = '6023c670-8337-4254-bd05-774048942df6';

let meteringdb;
let pricingdb;
let ratingdb;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);


let provisioning;
let server;

const generateMeteringPlan = (prefix, suffix) => {
  return {
    plan_id: `${prefix}test-${resourceId}`,
    measures: [
      {
        name: `classifiers${suffix}`,
        unit: `INSTANCE${suffix}`
      }
    ],
    metrics: [
      {
        name: `classifier_instances${suffix}`,
        unit: `INSTANCE${suffix}`,
        type: 'discrete',
        formula: 'AVG({classifier})'
      }
    ]
  };
};

const generatePricingPlan = (prefix, suffix) => {
  return {
    plan_id: `${prefix}test-db-basic-${resourceId}`,
    metrics: [
      {
        name: `classifier${suffix}`,
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
  };
};

const generateRatingPlan = (prefix, suffix) => {
  return {
    plan_id: `${prefix}test-${resourceId}`,
    metrics: [
      {
        name: `classifier${suffix}`,
        rate: ((price, qty) => new BigNumber(price || 0)
          .mul(qty).toNumber()).toString()
      }
    ]
  };
};

const insertPlanInDB = (plan, db, cb) => {
  yieldable.functioncb(function*() {
    const id = ['k', plan.plan_id].join('/');
    yield db.put(extend({}, plan, {
      _id: id
    }));
  })((error) => {
    if(error)
      throw error;
    cb();
  });
};

const updatePlanInDB = (plan, db, cb) => {
  yieldable.functioncb(function*() {
    const id = ['k', plan.plan_id].join('/');
    const doc = yield db.get(id);

    yield db.put(extend({}, plan, {
      _id: id,
      _rev: doc._rev
    }));
  })((error) => {
    if(error)
      throw error;
    cb();
  });
};

const getRequest = (planType, planId, headers, verifyCb) => {
  request.get(
    'http://localhost::p/v1/:plan_type/plans/:plan_id', {
      p: server.address().port,
      plan_id: planId,
      plan_type: planType,
      headers: headers
    }, (err, val) => {
      expect(err).to.equal(undefined);
      verifyCb(val);
    });
};

const testGetOfPlan = (planType, planIdPrefix, planGenerator, db,
  authHeader = {}) => {
  context(`when ${planType} plan is in DB`, () => {

    const noCache = { 'cache-control': 'no-cache' };
    const useCache = {};

    const originalPlan = planGenerator(planIdPrefix, '-original');
    const updatedPlan = planGenerator(planIdPrefix, '-updated');

    before((done) => {
      insertPlanInDB(originalPlan, db, done);
    });

    it('returns the plan', (done) => {
      const headers = extend({}, useCache, authHeader);
      getRequest(planType, originalPlan.plan_id, headers, (val) => {
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(originalPlan);
        done();
      });
    });

    context('when plan changed, verify', () => {
      before((done) => {
        updatePlanInDB(updatedPlan, db, done);
      });

      it('read from cache', (done) => {
        const headers = extend({}, useCache, authHeader);
        getRequest(planType, originalPlan.plan_id, headers, (val) => {
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(originalPlan);
          done();
        });
      });

      it('read with no cache', (done) => {
        const headers = extend({}, noCache, authHeader);
        getRequest(planType, originalPlan.plan_id, headers, (val) => {
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(updatedPlan);
          done();
        });
      });
    });
  });
};

const dropDbs = (done) => dbclient.drop(process.env.DB,
  /^abacus-rating-plan|^abacus-pricing-plan|^abacus-metering-plan/,
  done);


describe('When not secured', () => {

  meteringdb = yieldable(dbclient(partition.singleton,
    dbclient.dburi(uris.db, 'abacus-metering-plans')));
  pricingdb = yieldable(dbclient(partition.singleton,
    dbclient.dburi(uris.db, 'abacus-pricing-plans')));
  ratingdb = yieldable(dbclient(partition.singleton,
    dbclient.dburi(uris.db, 'abacus-rating-plans')));

  before((done) => {
    delete require.cache[require.resolve('..')];

    process.env.SECURED = false;

    provisioning = require('..');
    server = provisioning().listen(0);

    dropDbs(done);
  });

  context('abacus-provisioning-plugin plans get metering',
    () => testGetOfPlan('metering', '', generateMeteringPlan, meteringdb));

  context('abacus-provisioning-plugin plans get pricing',
    () => testGetOfPlan('pricing', '', generatePricingPlan, pricingdb));

  context('abacus-provisioning-plugin plans get rating',
    () => testGetOfPlan('rating', '', generateRatingPlan, ratingdb));

});

describe('When secured', () => {

  meteringdb = yieldable(dbclient(partition.singleton,
    dbclient.dburi(uris.db, 'abacus-metering-plans')));
  pricingdb = yieldable(dbclient(partition.singleton,
    dbclient.dburi(uris.db, 'abacus-pricing-plans')));
  ratingdb = yieldable(dbclient(partition.singleton,
    dbclient.dburi(uris.db, 'abacus-rating-plans')));

  before((done) => {
    delete require.cache[require.resolve('..')];

    process.env.SECURED = true;
    process.env.JWTKEY = utils.TOKEN_SECRET;
    process.env.JWTALGO = 'HS256';

    provisioning = require('..');
    server = provisioning().listen(0);

    dropDbs(done);
  });

  context('with system scope getting metering plan',
    () => testGetOfPlan('metering', 'sys-', generateMeteringPlan, meteringdb,
      utils.getSystemReadAuthorization()));

  context('with system scope getting pricing plan',
    () => testGetOfPlan('pricing', 'sys-', generatePricingPlan, pricingdb,
      utils.getSystemReadAuthorization()));

  context('with system scope getting rating plan',
    () => testGetOfPlan('rating', 'sys-', generateRatingPlan, ratingdb,
      utils.getSystemReadAuthorization()));

  it('should fails to get plan when non system scope is provided', (done) => {
    getRequest('metering', 'dummyPlanId',
      utils.getResourceWriteAuthorization(resourceId), (val) => {
        expect(val.statusCode).to.equal(403);
        done();
      });
  });

  context('with resource specific scope getting metering plan',
    () => testGetOfPlan('metering', 'res-', generateMeteringPlan, meteringdb,
      utils.getResourceReadAuthorization(resourceId)));

  context('with resource specific scope getting pricing plan',
    () => testGetOfPlan('pricing', 'res-', generatePricingPlan, pricingdb,
      utils.getResourceReadAuthorization(resourceId)));

  context('with resource specific scope getting rating plan',
    () => testGetOfPlan('rating', 'res-', generateRatingPlan, ratingdb,
      utils.getResourceReadAuthorization(resourceId)));

});
