'use strict';

/** @module abacus-metrics */

const { bind } = require('underscore');
const { Collection } = require('./lib/collection');
const { createRouter } = require('./lib/middleware');

const defaultCollection = new Collection();

module.exports = {
  Collection,
  defaultCollection,
  createMiddleware: createRouter,
  counter: bind(defaultCollection.counter, defaultCollection),
  bulletin: bind(defaultCollection.bulletin, defaultCollection)
};
