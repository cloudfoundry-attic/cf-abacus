'use strict';


const util = require('util');

const { bind } = require('underscore');
const { MongoClient } = require('mongodb');
const { Controller } = require('./lib/controller');
const { Sampler } = require('./lib/sampling');
const { createSpanDAO } = require('abacus-sampler-storage');
const { CollectorClient, throttledClient } = require('abacus-api');
const oauth = require('abacus-oauth');
const webapp = require('abacus-webapp');
const urienv = require('abacus-urienv');

const oneMonthInMs = 31 * 24 * 60 * 60 * 1000;
const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const samplingDimension = process.env.SAMPLER_DIMENSION || 'day';
const processingBatchOffset = 0;
const processingBatchSize = 10;
const cleanupBatchOffset = 0;
const cleanupBatchSize = 10;
const cleanupAge = oneMonthInMs;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

const uris = urienv({
  auth_server: 9882,
  collector: 9080
});

const isSecured = () => process.env.SECURED == 'true';

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
  const sampler = new Sampler(samplingDimension);

  let systemToken;
  if (isSecured()) {
    systemToken = oauth.cache(uris.auth_server, clientId, clientSecret, 'abacus.usage.write');
    const startToken = util.promisify(systemToken.start);
    await startToken();
  }

  const collectorClient = throttledClient(new CollectorClient(uris.collector, systemToken));

  const controller = new Controller({
    sampler: sampler,
    spanDAO: dao,
    abacusClient: collectorClient,
    samplingDimension: samplingDimension,
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
