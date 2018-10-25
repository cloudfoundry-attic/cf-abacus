'use strict';

const httpStatus = require('http-status-codes');
const { bind } = require('underscore');
const { MongoClient } = require('mongodb');
const { Controller } = require('./lib/controller');
const { Sampler } = require('./lib/sampling');
const { Scheduler } = require('./lib/scheduler');
const { createSpanDAO } = require('abacus-sampler-storage');
const { createHealthMonitor } = require('abacus-healthmonitor');
const { CollectorClient, throttledClient, BearerAuthHeaderProvider, VoidAuthHeaderProvider } = require('abacus-api');
const webapp = require('abacus-webapp');
const urienv = require('abacus-urienv');

const oneSecondInMs = 1000;
const oneMinuteInMs = 60 * oneSecondInMs;
const oneMonthInMs = 31 * 24 * 60 * oneMinuteInMs;


const processSpansMonitorThreshold = parseInt(process.env.PROCESS_SPANS_MONITOR_THRESHOLD) || oneMinuteInMs;
const cleanupSpansMonitorThreshold = parseInt(process.env.CLEANUP_SPANS_MONITOR_THRESHOLD) || oneMinuteInMs;

const skipSslValidation = process.env.SKIP_SSL_VALIDATION === 'true';
const mongoURI = process.env.DB_URI || 'mongodb://localhost:27017';
const samplingDimension = process.env.SAMPLER_DIMENSION || 'day';
const processingBatchOffset = 0;
const processingBatchSize = 100;
const cleanupBatchOffset = 0;
const cleanupBatchSize = 100;
const cleanupAge = oneMonthInMs;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

const uris = urienv({
  auth_server: 9882,
  collector: 9080
});

const isSecured = () => process.env.SECURED == 'true';

const createAuthHeaderProvider = () => {
  if (!isSecured()) 
    return new VoidAuthHeaderProvider();

  return new BearerAuthHeaderProvider({ 
    uaaUrl: uris.auth_server, 
    clientId: clientId, 
    clientSecret: clientSecret, 
    scopes: 'abacus.usage.sampler.write'
  });
};

const startApp = async () => {
  const mongoClient = await MongoClient.connect(mongoURI, {
    j: true,
    w: 'majority',
    wtimeout: 5000
  });
  const dao = await createSpanDAO(mongoClient, 'spans');
  const sampler = new Sampler(samplingDimension);

  const authHeaderProvider = createAuthHeaderProvider();
  const collectorClient = throttledClient(new CollectorClient(uris.collector, authHeaderProvider, skipSslValidation));

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

  const processSpansScheduler = new Scheduler();
  const processSpansHealthMonitor = createHealthMonitor(processSpansScheduler, processSpansMonitorThreshold, {
    success: ['successful'],
    failure: ['failure']
  });
  processSpansScheduler.schedule(bind(controller.processSpans, controller), oneSecondInMs);

  const cleanupSpansScheduler = new Scheduler();
  const cleanupSpansHealthMonitor = createHealthMonitor(cleanupSpansScheduler, cleanupSpansMonitorThreshold, {
    success: ['successful'],
    failure: ['failure']
  });
  cleanupSpansScheduler.schedule(bind(controller.cleanupSpans, controller), oneSecondInMs);

  const app = webapp();
  const healthcheckHandler = (req, res) => {
    const healthy = processSpansHealthMonitor.healthy() && cleanupSpansHealthMonitor.healthy();
    res.status(healthy ? httpStatus.OK : httpStatus.INTERNAL_SERVER_ERROR).send({
      healthy
    });
  };
  app.useHealthCheck(healthcheckHandler);
  
  app.listen();
};

module.exports = {
  runCLI: async () => await startApp()
};
