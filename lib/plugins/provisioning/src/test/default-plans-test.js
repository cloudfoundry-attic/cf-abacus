'use strict';
const fs = require('fs');
const path = require('path');

const { omit } = require('underscore');

// const request = require('abacus-request');
const dbclient = require('abacus-dbclient');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');
const partition = require('abacus-partition');


const uris = urienv({
  DB: 27017
});
const meteringdb = yieldable(dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-metering-plans')));
const pricingdb = yieldable(dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-pricing-plans')));
const ratingdb = yieldable(dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-rating-plans')));

const dbEnv = process.env.DB_URI || 'mongodb://localhost:27017';

describe('abacus-provisioning-plugin default plans', () => {
  let plansStore;

  before(() => {
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../lib/plan-db.js')];
    plansStore = require('../lib/store-plans.js');
  });

  const verifyDbContent = (planType, db, done) => {
    yieldable.functioncb(function*() {
      let planDir = path.join(__dirname, '../plans/' + planType);
      let plansFiles = fs.readdirSync(planDir);
      let expected = plansFiles.length;

      const checkDone = () => {
        expected--;
        if(expected === 0)
          done();
      };

      for(let planName of plansFiles) {
        const plan = require(path.join(planDir, planName));
        const planInDb = yield db.get(['k', plan.plan_id].join('/'));

        expect(omit(planInDb, 'id', '_id', '_rev')).to.deep.equal(plan);
        checkDone();
      }

    })((error) => {
      if (error)
        throw error;
    });
  };


  context('when storing new default plans', () => {

    before((done) => {
      dbclient.drop(dbEnv, /^abacus-rating-plan|^abacus-pricing-plan|^abacus-metering-plan/, () => {
        plansStore.storeAllDefaultPlans(done);
      });
    });

    it('all default metering plans should be stored in the db', (done) => {
      verifyDbContent('metering', meteringdb, done);
    });

    it('all default pricing plans should be stored in the db', (done) => {
      verifyDbContent('pricing', pricingdb, done);
    });

    it('all default rating plans should be stored in the db', (done) => {
      verifyDbContent('rating', ratingdb, done);
    });
  });

  context('when updating default ', () => {

    before((done) => {
      delete require.cache[require.resolve('..')];
      delete require.cache[require.resolve('../lib/plan-db.js')];
      plansStore = require('../lib/store-plans.js');
      dbclient.drop(dbEnv, /^abacus-rating-plan|^abacus-pricing-plan|^abacus-metering-plan/, done);
    });

    const testUpdate = (planType, db, planId, done) => {
      yieldable.functioncb(function*() {
        yield db.put({
          id: ['k', planId].join('/'),
          plan_id: planId
        });
      })(() => {
        plansStore.storeAllDefaultPlans(() => {
          verifyDbContent(planType, db, done);
        });
      });
    };

    it('metering plan', (done) => {
      testUpdate('metering', meteringdb, 'baas-metering-plan', done);
    });

    it('pricing plan', (done) => {
      testUpdate('pricing', pricingdb, 'baas-pricing-plan', done);
    });

    it('rating plan', (done) => {
      testUpdate('rating', ratingdb, 'baas-rating-plan', done);
    });

  });
});
