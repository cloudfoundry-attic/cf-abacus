'use strict';

const dataflow = require('abacus-dataflow');
const yieldable = require('abacus-yieldable');
const _ = require('underscore');
const extend = _.extend;

const put = (usage, dbName, cb) => {
  const db = dataflow.db(dbName);
  yieldable.functioncb(db.put)(extend({}, usage, {
    _id: usage.id
  }), (err, val) => {
    expect(err).to.equal(null);
    cb();
  });
};

module.exports = {
  accumulator: {
    put: (doc, cb = () => {}) => {
      put(doc, 'abacus-accumulator-accumulated-usage', cb);
    }
  },
  aggregator: {
    put: (doc, cb = () => {}) => {
      put(doc, 'abacus-aggregator-aggregated-usage', cb);
    }
  }
};


