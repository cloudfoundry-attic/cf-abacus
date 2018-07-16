'use strict';

/** @module abacus-metrics */

const { Collection } = require('./lib/collection');
const { createRouter } = require('./lib/middleware');

const defaultCollection = new Collection();

module.exports = {
  Collection,
  defaultCollection,
  createMiddleware: createRouter
};
