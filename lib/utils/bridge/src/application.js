'use strict';

const createCarryOver = require('abacus-carryover');
const createReporter = require('abacus-client');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const perf = require('abacus-perf');
const retry = require('abacus-retry');
const router = require('abacus-router');
const throttle = require('abacus-throttle');
const webapp = require('abacus-webapp');
const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const dbcache = require('./dbcache');
const execute = require('./executor');
const config = require('./config');
const buildStatistics = require('./statistics');
const createProgress = require('./event-progress');
const createEventReader = require('./event-reader');
const createEventBridge = require('./event-bridge');
const retrieveToken = require('./token-retriever');
const createOrgFilter = require('./org-filter');
const createDelayGenerator = require('./delay-generator');

const debug = require('abacus-debug')('abacus-bridge-application');
const edebug = require('abacus-debug')('e-abacus-bridge-application');

const perfUsageIdentifier = 'usage';

const retryInfinitely = function *(func) {
  const retryCall = yieldable(retry(functioncb(func), retry.forever));
  yield retryCall();
};

class Application {
  constructor() {
    this.statistics = buildStatistics({
      cache: dbcache.createStatistics()
    });

    this.errors = {
      missingToken: false,
      noReportEverHappened: true,
      consecutiveReportFailures: 0,
      lastError: '',
      lastErrorTimestamp: ''
    };

    this.cfg = config.loadFromEnvironment();
  }

  *getProgressDocumentId() {
    throw new Error('Implementation required');
  }

  *createPollingProgress(cfg) {
    const documentId = yield this.getProgressDocumentId();

    const cache = dbcache({
      url: cfg.db.url,
      documentId: documentId
    }, this.statistics.cache);

    return createProgress(cache, cfg.polling.events.lastKnownGUID);
  }

  *loadCFAdminToken(cfg) {
    return yield retrieveToken({
      authServerURI: cfg.cf.url,
      clientId: cfg.cf.clientID,
      clientSecret: cfg.cf.clientSecret
    });
  }

  *getCollectorTokenScopes() {
    throw new Error('Implementation required');
  }

  *loadCollectorToken(cfg) {
    if (!cfg.oauth.enabled)
      return undefined;

    const scopes = yield this.getCollectorTokenScopes();
    return yield retrieveToken({
      authServerURI: cfg.cf.url,
      clientId: cfg.collector.clientID,
      clientSecret: cfg.collector.clientSecret,
      scopes: scopes
    });
  }

  *createUsageReporter(reporter, token) {
    return {
      report: (usage, cb) => {
        reporter.reportUsage(usage, token, cb);
      }
    };
  };

  *createEventConverter() {
    throw new Error('Implementation required!');
  }

  *createEventFilters(cfg) {
    const filters = [];
    if (cfg.polling.orgs)
      filters.push(createOrgFilter(cfg.polling.orgs));
    return filters;
  };

  *createEventReaderURLFactory() {
    throw new Error('Implementation required!');
  }

  *createBridgeEventReader(cfg) {
    const factory = yield this.createEventReaderURLFactory();
    const self = this;
    return {
      poll: (guid, callback) => {
        const url = factory(guid);
        const reader = createEventReader({
          url,
          token: self.cfAdminToken,
          minAge: cfg.polling.events.minAge,
          statistics: self.statistics
        });
        return reader.poll(callback);
      }
    };
  };

  *createStatsRoute(cfg) {
    const route = router();
    if (cfg.oauth.enabled)
      route.use(oauth.authorizer(
        cfg.oauth.jwtKey,
        cfg.oauth.jwtAlgorithm,
        ['abacus.usage.read'])
      );

    const self = this;
    route.get('/', throttle(function *(req) {
      return {
        body: {
          config: cfg,
          cache: self.progress.get(),
          performance: {
            cache: {
              read: perf.stats('cache.read'),
              write: perf.stats('cache.write')
            },
            paging: {
              pages: perf.stats('paging'),
              resources: perf.stats('paging.resources')
            },
            report: perf.stats('report'),
            usage: perf.stats(perfUsageIdentifier),
            carryOver: perf.stats('carryOver')
          },
          statistics: self.statistics,
          errors: self.errors
        }
      };
    }));
    return route;
  };

  *load() {
    debug('Loading event polling progress...');
    this.progress = yield this.createPollingProgress(this.cfg);
    yield retryInfinitely(this.progress.load);

    debug('Acquiring Cloud Foundry admin token...');
    this.cfAdminToken = yield this.loadCFAdminToken(this.cfg);

    debug('Acquiring Abacus Collector token...');
    this.collectorToken = yield this.loadCollectorToken(this.cfg);

    debug('Creating event reader...');
    this.eventReader = yield this.createBridgeEventReader(this.cfg);

    debug('Creating event filters...');
    this.filters = yield this.createEventFilters(this.cfg);

    debug('Creating event to usage converter...');
    this.convertEvent = yield this.createEventConverter();

    debug('Creating reporter...');
    const reporter = createReporter(this.errors);
    const registerError = reporter.registerError;
    this.usageReporter = yield this.createUsageReporter(
      reporter, this.collectorToken);

    debug('Creating carry over...');
    this.carryOver = createCarryOver(
      this.statistics, registerError);

    debug('Creating delay generator...');
    this.delayGenerator = createDelayGenerator(
      this.cfg.polling.minInterval,
      this.cfg.polling.maxInterval
    );

    debug('Creating bridge...');
    this.bridge = createEventBridge({
      eventReader: this.eventReader,
      eventFilters: this.filters,
      convertEvent: this.convertEvent,
      usageReporter: this.usageReporter,
      carryOver: this.carryOver,
      progress: this.progress,
      delayGenerator: this.delayGenerator
    });
    this.bridge.on('usage.conflict', () => {
      this.statistics.usage.success.conflicts++;
    });
    this.bridge.on('usage.skip', () => {
      this.statistics.usage.success.skips++;
    });
    this.bridge.on('usage.failure', (err, operationStart) => {
      this.statistics.usage.failures++;
      registerError('Error reporting usage',
        err, undefined, perfUsageIdentifier, operationStart);
    });
    this.bridge.on('usage.success', (operationStart) => {
      this.statistics.usage.success.all++;
      perf.report(perfUsageIdentifier, operationStart);
    });

    debug('Creating web...');
    const statsRoute = yield this.createStatsRoute(this.cfg);
    this.app = webapp();
    this.app.use('/v1/stats', statsRoute);
  }

  run(cb) {
    cluster.singleton();

    const bridgeExecutable = ((self) => {
      return {
        start: (cb) => {
          self.bridge.start(cb);
        },
        stop: (cb) => {
          self.bridge.stop(cb);
        }
      };
    })(this);

    const webExecutable = ((self) => {
      let server = null;
      return {
        start: (cb) => {
          server = self.app.listen(undefined, cb);
        },
        stop: (cb) => {
          if (server)
            server.close(cb);
          else
            cb();
        }
      };
    })(this);

    functioncb(function *(self) {
      yield self.load();

      if (cluster.isWorker())
        execute(bridgeExecutable)
          .on('start-success', () => {
            debug('Started background job.');
          })
          .on('start-failure', (err) => {
            edebug('Failed to start background job: %s', err);
            throw err;
          })
          .on('stop-success', () => {
            debug('Stopped background job.');
          })
          .on('stop-failure', (err) => {
            edebug('Failed to stop background job: %s', err);
            throw err;
          });

      execute(webExecutable)
        .on('start-success', () => {
          debug('Started server.');
        })
        .on('start-failure', (err) => {
          edebug('Failed to start server: %s', err);
          throw err;
        })
        .on('stop-success', () => {
          debug('Stopped server.');
        })
        .on('stop-failure', (err) => {
          edebug('Failed to stop server: %s', err);
          throw err;
        });
    })(this, cb);
  }
};

module.exports = Application;
