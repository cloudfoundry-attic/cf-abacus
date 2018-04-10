'use strict';

const _ = require('underscore');
const memoize = _.memoize;
const uniq = _.uniq;
const range = _.range;
const map = _.map;
const reduce = _.reduce;

const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const router = require('abacus-router');
const throttle = require('abacus-throttle');
const transform = require('abacus-transform');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');

// Setup debug log
const debug = require('abacus-debug')('abacus-housekeeper');
const edebug = require('abacus-debug')('e-abacus-housekeeper');

const dbaliasCollector = process.env.DBALIAS_COLLECTOR || 'db';
const dbaliasMeter = process.env.DBALIAS_METER || 'db';
const dbaliasAccumulator = process.env.DBALIAS_ACCUMULATOR || 'db';
const dbaliasAggregator = process.env.DBALIAS_AGGREGATOR || 'db';
const dbaliasBridge = process.env.DBALIAS_BRIDGE || 'db';
const dbaliasPlugins = process.env.DBALIAS_PLUGINS || 'db';

// Resolve service URIs
const uris = memoize(() => urienv({
  auth_server : 9882,
  [dbaliasCollector] : 5984,
  [dbaliasMeter] : 5984,
  [dbaliasAccumulator] : 5984,
  [dbaliasAggregator] : 5984,
  [dbaliasBridge] : 5984,
  [dbaliasPlugins] : 5984
}));

// Function call statistics
const statistics = {
  tasks: {
    deleteOldPartitions: {
      deletedPartitionsCount: 0,
      errors: 0
    }
  },
  retries: {
    count: 0
  }
};

const errors = {
  deleteOldPartitions: null
};

// Retention period
const retentionPeriod = parseInt(process.env.RETENTION_PERIOD) || 3;

const pad = (num) => {
  return (num > 9 ? '' : '0') + num;
};

const toString = (arr) => {
  if (arr.length === 0)
    return '';
  const s = reduce(arr.slice(1), (acc, v) => acc + '|' + pad(v), pad(arr[0]));
  return arr.length === 1 ? s : '(' + s + ')';
};

// Create a regex that matches <year><month> partition suffixes for
// years / months older than the specified moment, starting with 2015.
// For example, the following regex matches all suffixes older than 201606.
// .*-20(15(0[1-9]|1[0-2])|16(01|02|03|04|05|06))
const regex = (m) => {
  const year = m.year() - 2000;
  const pastYears = toString(range(15, year));
  const years = toString(range(15, year + 1));
  const allMonths = '(0[1-9]|1[0-2])';
  const months = toString(map(range(0, m.month() + 1), (x) => x + 1));
  const s =
    m.year() === 2015 ? '.*-20' + pad(year) + months :
      m.month() === 11 ? '.*-20' + years + allMonths :
        '.*-20(' + pastYears + allMonths + '|' + pad(year) + months + ')';
  return new RegExp(s);
};

// Database servers
const servers = uniq([]
  .concat(uris()[dbaliasCollector])
  .concat(uris()[dbaliasMeter])
  .concat(uris()[dbaliasAccumulator])
  .concat(uris()[dbaliasAggregator])
  .concat(uris()[dbaliasBridge])
  .concat(uris()[dbaliasPlugins]));

// Delete all partitions on all servers older than the configured retention
// period
const deleteOldPartitions = (cb) => {
  const last = moment.utc().startOf('month')
    .subtract(retentionPeriod + 1, 'months');
  debug('Deleting partitions on servers %o older than %s', servers,
    '' + last.year() + pad(last.month() + 1));
  dbclient.deletePartitions(servers, regex(last), (err, res) => {
    if (err) {
      statistics.tasks.deleteOldPartitions.errors++;
      errors.deleteOldPartitions = err;
      return cb(err);
    }

    statistics.tasks.deleteOldPartitions.deletedPartitionsCount += res.length;
    return cb();
  });
};

const tasks = [deleteOldPartitions];

// Use secure routes or not
const secured = process.env.SECURED === 'true';

// Retry interval
const retryInterval = parseInt(process.env.RETRY_INTERVAL) || 86400000;

// Create an express router
const routes = router();

const setHousekeepTimeout = (fn, interval) => {
  clearTimeout(module.housekeeper);
  module.housekeeper = setTimeout(fn, interval);
  debug('Retry interval set to %d ms after %d retries',
    interval, statistics.retries.count);
  statistics.retries.count++;
};

const runTasks = (cb) => {
  debug('Running housekeeper tasks');

  debug('Scheduling next execution on %s',
    moment.utc().add(retryInterval, 'milliseconds').toDate());
  setHousekeepTimeout(() => runTasks(cb), retryInterval);

  transform.map(tasks, (task, index, tasks, mcb) => task(mcb), cb);
};

const stopHousekeeper = (cb = () => {}) => {
  edebug('Stopping housekeeper');

  // Cancel scheduled timers
  clearTimeout(module.housekeeper);

  if (typeof cb === 'function')
    cb();
};

const startHousekeeper = () => {
  debug('Starting housekeeper');

  setHousekeepTimeout(() => runTasks((err) => {
    if (err)
      edebug('Housekeeper tasks failed');
    else
      debug('Housekeeper tasks completed successfully');
  }), 0);

  process.on('exit', stopHousekeeper);
};

routes.get('/v1/housekeeper', throttle(function*(req) {
  debug('Getting housekeeper info');
  return {
    body: {
      housekeeper: {
        statistics: statistics,
        errors: errors
      }
    }
  };
}));

// Create a housekeeper app
const housekeep = () => {
  debug('Starting housekeeper app');
  cluster.singleton();

  if (cluster.isWorker()) {
    debug('Starting housekeeper worker');
    startHousekeeper();
  }

  // Create the Webapp
  const app = webapp();

  if(secured)
    app.use(/^\/v1\/housekeeper/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);

  return app;
};

// Command line interface, create the housekeeper app and listen
const runCLI = () => housekeep().listen();

module.exports = housekeep;
module.exports.regex = regex;
module.exports.runTasks = runTasks;
module.exports.runCLI = runCLI;
