'use strict';

const dataflow = require('abacus-dataflow');
const yieldable = require('abacus-yieldable');
const _ = require('underscore');
const extend = _.extend;

const storeAccumulatedUsage = (accUsage, cb = () => {}) => {
  const accumulatordb = dataflow.db('abacus-accumulator-accumulated-usage');
  yieldable.functioncb(accumulatordb.put)(extend({}, accUsage, {
    _id: accUsage.id
  }), (err, val) => {
    expect(err).to.equal(null);
    cb();
  });
};

const storeRatedUsage = (ratedUsage, cb = () => {}) => {
  const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage');
  yieldable.functioncb(aggregatordb.put)(extend({}, ratedUsage, {
    _id: ratedUsage.id
  }), (err, val) => {
    expect(err).to.equal(null);
    cb();
  });
};

module.exports = {
  storeAccumulatedUsage: storeAccumulatedUsage,
  storeRatedUsage: storeRatedUsage
};
