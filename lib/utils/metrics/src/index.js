'use strict';

/** @module abacus-metrics */

const { bind } = require('underscore');
const { Collection, NopCollection } = require('./lib/collection');
const { createRouter } = require('./lib/middleware');

const metricsEnabled = process.env.CUSTOM_METRICS == 'true';
const defaultCollection = metricsEnabled ? new Collection() : new NopCollection();

module.exports = {
  Collection,
  defaultCollection,
  createMiddleware: createRouter,
  counter: bind(defaultCollection.counter, defaultCollection),
  bulletin: bind(defaultCollection.bulletin, defaultCollection),
  gauge: bind(defaultCollection.gauge, defaultCollection)
};
