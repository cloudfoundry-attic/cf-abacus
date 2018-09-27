'use strict';

const { clone, extend } = require('underscore');

const commander = require('commander');

const request = require('abacus-request');
const dbclient = require('abacus-dbclient');
const dataflow = require('abacus-dataflow');
const lifecycleManager = require('abacus-lifecycle-manager')();
const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

// Setup the debug log
const debug = require('abacus-debug')('abacus-usage-reporting-itest');

// Parse command line options
const argv = clone(process.argv);
argv.splice(1, 1, 'usage-reporting-itest');
commander
  .option('-t, --start-timeout <n>', 'external processes start timeout in milliseconds', parseInt)
  .option('-x, --total-timeout <n>', 'test timeout in milliseconds', parseInt)
  .allowUnknownOption(true)
  .parse(argv);

// External Abacus processes start timeout
const startTimeout = commander.startTimeout || 30000;

// This test timeout
const totalTimeout = commander.totalTimeout || 60000;

const aggregatordb = dataflow.db('abacus-aggregator-aggregated-usage');
const dbBulk = yieldable.functioncb(aggregatordb.bulkDocs);

const ratedUsage = require('./ratedUsage.json');

const todaysReport = require('./report.json');
const futureReport = require('./offset_report.json');

const now = moment.utc().startOf('month').add(12, 'days').valueOf();

const replaceTimePart = (string) => {
  const parts = string.split('-');
  parts[0] = dbclient.pad16(now);
  return parts.join('-');
};

const changeTimestamps = (doc) => {
  if (doc.spaces) {
    if (doc.spaces.consumers)
      doc.spaces[0].consumers[0].t = dbclient.pad16(now);
    if (doc.spaces.t)
      doc.spaces.t = replaceTimePart(doc.spaces.t);
  }

  // Space document
  if (doc.consumers && doc.consumers.t)
    doc.consumers.t = replaceTimePart(doc.consumers.t);

  return doc;
};

const setupRatedUsageDocs = (templates) => {
  const ratedDocs = [];
  for(let template of templates) {
    const newId = dbclient.kturi(dbclient.k(template.id), now);
    const newAccumulatedId = dbclient.tkuri(dbclient.k(template.accumulated_usage_id), now + '-0-0-1-0');
    const doc = extend({}, template, {
      id: newId,
      _id: newId,
      accumulated_usage_id: newAccumulatedId,
      start: now,
      end: now,
      processed: now
    });

    ratedDocs.push(changeTimestamps(doc));
  }

  return ratedDocs;
};

const setupReport = (report) => extend({}, report, {
  id: dbclient.kturi(dbclient.k(report.id), now),
  start: now,
  end: now,
  processed: now
});

// Upload the rated usage in aggregator DB
const uploadRatedUsage = (done) => {
  debug('Uploading rated docs ...');
  dbBulk(setupRatedUsageDocs(ratedUsage), {}, (err, val) => {
    expect(err).to.equal(null);
    expect(val).to.not.equal(undefined);

    debug('Uploaded rated documents');
    done();
  });
};

const offset = () => process.env.ABACUS_TIME_OFFSET ? parseInt(process.env.ABACUS_TIME_OFFSET) : 0;

// Get usage report, throttled to default concurrent requests
const getReport = (orgId, cb) => {
  const reportTime = now + offset() + 1;
  debug(`Requesting org report for ${orgId} @ ${moment.utc(reportTime)}`);
  request.get(
    'http://localhost::port/v1/metering/organizations/:organization_id/aggregated/usage/:time',
    {
      port: 9088,
      organization_id: orgId,
      time: reportTime
    },
    (err, val) => {
      expect(err).to.equal(undefined);
      debug(`Got report for ${orgId} @ ${moment.utc(val.body.processed)}`);
      cb(val.body);
    }
  );
};

const verifyReports = (expectedReport, cb) => {
  const orgId = ratedUsage[0].organization_id;
  getReport(orgId, (report) => {
    expect(report, `Report for ${orgId} does not match`).to.deep.equal(expectedReport);
    cb();
  });
};

const checkReport = (expectedReport, done) => {
  // Wait for usage reporting service to start
  request.waitFor('http://localhost::p/batch', { p: 9088 }, startTimeout, (err) => {
    // Failed to ping usage reporting service before timing out
    if (err) throw err;

    // Upload organization usage and verify
    uploadRatedUsage(() => verifyReports(expectedReport, done));
  });
};

describe('abacus-usage-reporting-itest', () => {
  beforeEach((done) => {
    dbclient.drop(process.env.DB_URI, /^abacus-/, done);
  });

  afterEach(() => {
    lifecycleManager.stopAllStarted();
  });

  context('with the current time', () => {
    const expectedReport = setupReport(todaysReport);

    beforeEach(() => {
      lifecycleManager.startModules([
        lifecycleManager.modules.accountPlugin,
        lifecycleManager.modules.reporting
      ]);
    });

    it('reports rated usage submissions', function(done) {
      this.timeout(totalTimeout + 2000);
      checkReport(expectedReport, done);
    });
  });

  context('4 days in the future', () => {
    const expectedReport = setupReport(futureReport);

    beforeEach(() => {
      process.env.ABACUS_TIME_OFFSET = 4 * 24 * 60 * 60 * 1000;

      lifecycleManager.useEnv(process.env).startModules([
        lifecycleManager.modules.accountPlugin,
        lifecycleManager.modules.reporting
      ]);
    });

    it('shifts windows', function(done) {
      this.timeout(totalTimeout + 2000);
      checkReport(expectedReport, done);
    });
  });

});
