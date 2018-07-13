'use strict';

/** @module abacus-metrics */

const { Collection } = require('./lib/collection');

const defaultCollection = new Collection();

module.exports = {
  Collection,
  defaultCollection
};
