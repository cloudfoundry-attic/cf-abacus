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
const report = require('./report.json');

const now = moment.now();

const setupRatedUsageDocs = (templates) => {
  const ratedDocs = [];
  for(let template of templates) {
    const newId = dbclient.kturi(dbclient.k(template.id), now);
    const doc = extend({}, template, {
      id: newId,
      _id: newId,
      start: now,
      end: now,
      processed: now
    });
    if (doc.spaces)
      doc.spaces[0].consumers[0].t = dbclient.pad16(now);
    ratedDocs.push(doc);
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

// Get usage report, throttled to default concurrent requests
const getReport = (orgId, cb) => {
  debug(`Getting org report for ${orgId} at ${now}`);
  request.get(
    'http://localhost::port/v1/metering/organizations/:organization_id/aggregated/usage/:time',
    {
      port: 9088,
      organization_id: orgId,
      time: now + 1
    },
    (err, val) => {
      expect(err).to.equal(undefined);
      debug(`Got report for ${orgId} at ${now}`);
      cb(val.body);
    }
  );
};

const verifyReports = (cb) => {
  const orgId = ratedUsage[0].organization_id;
  const expectedReport = setupReport(report);
  getReport(orgId, (report) => {
    expect(report, `Report for ${orgId} does not match`).to.deep.equal(expectedReport);
    cb();
  });
};

describe('abacus-usage-reporting-itest', () => {
  before(() => {
    const modules = [lifecycleManager.modules.accountPlugin, lifecycleManager.modules.reporting];

    dbclient.drop(process.env.DB_URI, /^abacus-/, () => {
      const appsEnv = extend({}, process.env, {
        DB_ACCUMULATOR_URI: process.env.DB_URI,
        DB_AGGREGATOR_URI: process.env.DB_URI
      });
      lifecycleManager.useEnv(appsEnv).startModules(modules);
    });
  });

  after(() => {
    lifecycleManager.stopAllStarted();
  });

  it('report rated usage submissions', function(done) {
    this.timeout(totalTimeout + 2000);

    // Wait for usage reporting service to start
    request.waitFor('http://localhost::p/batch', { p: 9088 }, startTimeout, (err) => {
      // Failed to ping usage reporting service before timing out
      if (err) throw err;

      // Upload organization usage and verify
      uploadRatedUsage(() => verifyReports(done));
    });
  });
});
