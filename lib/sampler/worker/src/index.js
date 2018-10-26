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
const moment = require('abacus-moment');

const oneSecondInMs = moment.duration(1, 'second').asMilliseconds();
const oneMinuteInMs = moment.duration(1, 'minute').asMilliseconds();
const oneMonthInMs = moment.duration(1, 'month').asMilliseconds();

const cfg = {
  isSecured: process.env.SECURED === 'true',
  processSpansMonitorThreshold : parseInt(process.env.PROCESS_SPANS_MONITOR_THRESHOLD) || oneMinuteInMs,
  cleanupSpansMonitorThreshold : parseInt(process.env.CLEANUP_SPANS_MONITOR_THRESHOLD) || oneMinuteInMs,
  skipSslValidation : process.env.SKIP_SSL_VALIDATION === 'true',
  spansCollectioName : 'spans',
  mongoURI : process.env.DB_URI || 'mongodb://localhost:27017',
  samplingDimension : process.env.SAMPLER_DIMENSION || 'day',
  processingBatchOffset : 0,
  processingBatchSize : process.env.PROCESS_BATCH_SIZE || 100,
  processScheduleInterval: process.env.PROCESS_SCHEDULE_INTERVAL || oneSecondInMs,
  cleanupBatchOffset : 0,
  cleanupBatchSize : process.env.CLEANUP_BATCH_SIZE || 100,
  cleanupScheduleInterval: process.env.CLEANUP_SCHEDULE_INTERVAL || oneSecondInMs,
  cleanupAge : oneMonthInMs,
  clientId : process.env.CLIENT_ID,
  clientSecret : process.env.CLIENT_SECRET
};


const uris = urienv({
  auth_server: 9882,
  collector: 9080
});

const createAuthHeaderProvider = () => {
  if (!cfg.isSecured) 
    return new VoidAuthHeaderProvider();

  return new BearerAuthHeaderProvider({ 
    uaaUrl: uris.auth_server, 
    clientId: cfg.clientId, 
    clientSecret: cfg.clientSecret, 
    scopes: 'abacus.usage.sampler.write'
  });
};

const startApp = async () => {
  const mongoClient = await MongoClient.connect(cfg.mongoURI, {
    j: true,
    w: 'majority',
    wtimeout: 5000
  });
  const dao = await createSpanDAO(mongoClient, cfg.spansCollectioName);
  const sampler = new Sampler(cfg.samplingDimension);

  const authHeaderProvider = createAuthHeaderProvider();
  const collectorClient = throttledClient(new CollectorClient(uris.collector, authHeaderProvider, cfg.skipSslValidation));

  const controller = new Controller({
    sampler: sampler,
    spanDAO: dao,
    abacusClient: collectorClient,
    samplingDimension: cfg.samplingDimension,
    processingBatchOffset: cfg.processingBatchOffset,
    processingBatchSize: cfg.processingBatchSize,
    cleanupBatchOffset: cfg.cleanupBatchOffset,
    cleanupBatchSize: cfg.cleanupBatchSize,
    cleanupAge: cfg.cleanupAge
  });

  const processSpansScheduler = new Scheduler();
  const processSpansHealthMonitor = createHealthMonitor(processSpansScheduler, cfg.processSpansMonitorThreshold, {
    success: ['success'],
    failure: ['failure']
  });
  processSpansScheduler.schedule(bind(controller.processSpans, controller), cfg.processScheduleInterval);

  const cleanupSpansScheduler = new Scheduler();
  const cleanupSpansHealthMonitor = createHealthMonitor(cleanupSpansScheduler, cfg.cleanupSpansMonitorThreshold, {
    success: ['success'],
    failure: ['failure']
  });
  cleanupSpansScheduler.schedule(bind(controller.cleanupSpans, controller), cfg.cleanupScheduleInterval);

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
