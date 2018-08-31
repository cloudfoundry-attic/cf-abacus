'use strict';
const fs = require('fs');
const path = require('path');

const { extend, omit } = require('underscore');

// const request = require('abacus-request');
const dbclient = require('abacus-dbclient');
const cluster = require('abacus-cluster');
const partition = require('abacus-partition');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

const uris = urienv({
  DB: 27017
});

const meteringdb = yieldable(
  dbclient(
    partition.singleton,
    dbclient.dburi(uris.db, 'abacus-metering-plans')
  )
);

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster);

describe('abacus-provisioning-plugin default plans', () => {
  let provisioning;

  before(() => {
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../lib/plan-db.js')];
    provisioning = require('..');
  });

  const verifyDbContent = (done) => {
    yieldable.functioncb(function*() {
      let planDir = path.join(__dirname, '../plans');
      let plansFiles = fs.readdirSync(planDir);
      let expected = plansFiles.length;

      const checkDone = () => {
        expected--;
        if(expected === 0)
          done();
      };

      for(let planName of plansFiles) {
        const plan = require(path.join(planDir, planName));
        const planInDb = yield meteringdb.get(['k', plan.plan_id].join('/'));

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
      dbclient.drop(
        process.env.DB,
        /^abacus-metering-plan/,
        () => provisioning.storeAllDefaultPlans(done)
      );
    });


    it('all default metering plans should be stored in the db', (done) => {
      verifyDbContent(done);
    });

  });

  context('when updating default ', () => {

    before((done) => {
      delete require.cache[require.resolve('..')];
      delete require.cache[require.resolve('../lib/plan-db.js')];
      provisioning = require('..');
      dbclient.drop(
        process.env.DB,
        /^abacus-metering-plan/,
        done
      );
    });

    const testUpdate = (planId, done) => {
      yieldable.functioncb(function*() {
        yield meteringdb.put({
          id: ['k', planId].join('/'),
          plan_id: planId
        });
      })(() => {
        provisioning.storeAllDefaultPlans(() => {
          verifyDbContent(done);
        });
      });
    };

    it('metering plan', (done) => {
      testUpdate('baas-metering-plan', done);
    });

  });
});
