'use strict';

const dbclient = require('abacus-dbclient');
const yieldable = require('abacus-yieldable');

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

describe('abacus-plan-mappings', () => {
  let mappings;

  before((done) => {
    delete require.cache[require.resolve('..')];
    mappings = require('..');

    // Delete test dbs (plan and mappings) on the configured db server
    dbclient.drop(process.env.DB, /^abacus-.*-plan-mappings/, done);
  });

  context('manages mappings', () => {

    context('creates', () => {
      it('metering mapping', (done) => {
        yieldable.functioncb(function *() {
          yield mappings.newMeteringMapping('object-storage', 'default',
            'basic-object-storage');

          const planId = yield mappings.mappedMeteringPlan(
            'object-storage', 'default');
          expect(planId).to.equal('basic-object-storage');
        })((error) => {
          done(error);
        });
      });

      it('rating mapping', (done) => {
        yieldable.functioncb(function *() {
          yield mappings.newRatingMapping('object-storage', 'default',
            'basic-object-storage');

          const planId = yield mappings.mappedRatingPlan(
            'object-storage', 'default');
          expect(planId).to.equal('basic-object-storage');
        })((error) => {
          done(error);
        });
      });

      it('pricing mapping', (done) => {
        yieldable.functioncb(function *() {
          yield mappings.newPricingMapping('object-storage', 'default',
            'basic-object-storage');

          const planId = yield mappings.mappedPricingPlan(
            'object-storage', 'default');
          expect(planId).to.equal('basic-object-storage');
        })((error) => {
          done(error);
        });
      });
    });

    context('pre-defined', () => {
      before((done) => {
        mappings.storeDefaultMappings(done);
      });

      it('stores metering mappings', (done) => {
        yieldable.functioncb(function *() {
          const planId = yield mappings.mappedMeteringPlan(
            'object-storage', 'basic');
          expect(planId).to.equal('basic-object-storage');
        })((error) => {
          done(error);
        });
      });

      it('stores rating mappings', (done) => {
        yieldable.functioncb(function *() {
          const planId = yield mappings.mappedRatingPlan(
            'object-storage', 'basic');
          expect(planId).to.equal('object-rating-plan');
        })((error) => {
          done(error);
        });
      });

      it('stores pricing mappings', (done) => {
        yieldable.functioncb(function *() {
          const planId = yield mappings.mappedPricingPlan(
            'object-storage', 'basic');
          expect(planId).to.equal('object-pricing-basic');
        })((error) => {
          done(error);
        });
      });
    });
  });

  it('exports default JSONs', () => {
    expect(mappings.sampleMetering).to.not.equal(undefined);
    expect(mappings.samplePricing).to.not.equal(undefined);
    expect(mappings.sampleRating).to.not.equal(undefined);
  });

});

