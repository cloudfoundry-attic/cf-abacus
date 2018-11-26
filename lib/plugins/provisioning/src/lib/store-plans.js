'use strict';

const fs = require('fs');
const path = require('path');

const yieldable = require('abacus-yieldable');

const plansDb = require('../lib/plan-db.js');

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-provisioning-plugin');

const upsertPlan = function*(type, plan) {
  if (yield plansDb.read({ cache: false })[type](plan.plan_id))
    yield plansDb.update[type](plan.plan_id, plan);
  else
    yield plansDb.create[type](plan);
};

const storeAllPlansOfType = (type, cb) => {
  const planDir = path.join(__dirname, '..', 'plans', type);
  const planFiles = fs.readdirSync(planDir);
  yieldable.functioncb(function*() {
    for(let file in planFiles) {
      const defaultPlan = require(path.join(planDir, planFiles[file]));
      yield upsertPlan(type, defaultPlan);
    }
  })((error) => {
    if(error)
      throw new Error('Failed to store default plan: ' + error);

    debug('Default %s plan mappings created', type);
    cb();
  });
};

const storeAllDefaultPlans = (cb = () => {}) => {
  let callCount = 0;
  const countCb = () => {
    if(++callCount === 3)
      cb();
  };
  const types = ['metering', 'pricing', 'rating'];

  for(let type of types)
    storeAllPlansOfType(type, countCb);
};

module.exports.storeAllDefaultPlans = storeAllDefaultPlans;
