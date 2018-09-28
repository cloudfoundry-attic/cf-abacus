'use strict';

const webapp = require('abacus-webapp');
const { bind } = require('underscore');
const { MongoClient } = require('mongodb');
const { Controller } = require('./lib/controller');
const { Sampler } = require('./lib/sampling');
const { createSpanDAO } = require('abacus-sampler-storage');
const { CollectorClient } = require('abacus-api');
const urienv = require('abacus-urienv');

const oneDayInMs = 24 * 60 * 60 * 1000;
const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const dimension = process.env.SAMPLER_DIMENSION || 'day';
const processingBatchOffset = process.env.SAMPLE_OFFSET || 0;
const processingBatchSize = process.env.SAMPLE_BATCH_SIZE || 10;
const cleanupBatchOffset = process.env.CLEANUP_OFFSET || 0;
const cleanupBatchSize = process.env.CLEANUP_OFFSET || 10;
const cleanupAge = process.env.CLEANUP_AGE || oneDayInMs;

const uris = urienv({
  collector: 9080
});

const sleep = (duration) => {
  return new Promise((cb) => setTimeout(cb, duration));
};

const schedule = async (func, interval) => {
  while (true) {
    try {
      await func();
    } catch (e) {
      console.log('schedule error: %o', e);
    }
    await sleep(interval);
  }
};

const startApp = async () => {
  const app = webapp();
  app.listen();

  const mongoClient = await MongoClient.connect(mongoURI, {
    j: true,
    w: 'majority',
    wtimeout: 5000
  });
  const dao = await createSpanDAO(mongoClient, 'spans');
  const sampler = new Sampler(dimension);
  const collectorClient = new CollectorClient(uris.collector);

  const controller = new Controller({
    sampler: sampler,
    spanDAO: dao,
    abacusClient: collectorClient,
    samplingDimension: dimension,
    processingBatchOffset: processingBatchOffset,
    processingBatchSize: processingBatchSize,
    cleanupBatchOffset: cleanupBatchOffset,
    cleanupBatchSize: cleanupBatchSize,
    cleanupAge: cleanupAge
  });
  schedule(bind(controller.processSpans, controller), 200);
  schedule(bind(controller.cleanupSpans, controller), 200);
};

module.exports = {
  runCLI: async () => await startApp()
};
