'use strict';

const { extend } = require('underscore');

const request = require('abacus-request');
const dbclient = require('abacus-dbclient');
const dataflow = require('abacus-dataflow');
const lifecycleManager = require('abacus-lifecycle-manager')();
const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

// Setup the debug log
const debug = require('abacus-debug')('abacus-usage-reporting-itest');

const testEnv = {
  db: process.env.DB_URI || 'mongodb://localhost:27017',
  offset: () => process.env.ABACUS_TIME_OFFSET ? parseInt(process.env.ABACUS_TIME_OFFSET) : 0,
  startTimeout: process.env.START_TIMEOUT || 30000,
  totalTimeout: process.env.TOTAL_TIMEOUT || 60000
};

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
const uploadRatedUsage = (usage, done) => {
  debug('Uploading rated docs ...');
  dbBulk(usage, {}, (err, val) => {
    expect(err).to.equal(null);
    expect(val).to.not.equal(undefined);

    debug('Uploaded rated documents');
    done();
  });
};

// Get usage report, throttled to default concurrent requests
const getReport = (orgId, cb) => {
  const reportTime = now + testEnv.offset() + 1;
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
  request.waitFor('http://localhost::p/batch', { p: 9088 }, testEnv.startTimeout, (err) => {
    // Failed to ping usage reporting service before timing out
    if (err) throw err;

    // Upload organization usage and verify
    verifyReports(expectedReport, done);
  });
};

describe('Reporting integration test', () => {
  beforeEach((done) => {
    dbclient.drop(testEnv.db, /^abacus-/, done);
  });

  afterEach(() => {
    lifecycleManager.stopAllStarted();
  });

  context('with the current time', () => {
    const expectedReport = setupReport(todaysReport);

    beforeEach((done) => {
      lifecycleManager.startModules([
        lifecycleManager.modules.accountPlugin,
        lifecycleManager.modules.reporting
      ]);
      uploadRatedUsage(setupRatedUsageDocs(ratedUsage), done);
    });

    it('reports rated usage submissions', function(done) {
      this.timeout(testEnv.totalTimeout + 2000);
      checkReport(expectedReport, done);
    });
  });

  context('with time 4 days in the future', () => {
    const expectedReport = setupReport(futureReport);

    beforeEach((done) => {
      process.env.ABACUS_TIME_OFFSET = 4 * 24 * 60 * 60 * 1000;

      lifecycleManager.useEnv(process.env).startModules([
        lifecycleManager.modules.accountPlugin,
        lifecycleManager.modules.reporting
      ]);
      uploadRatedUsage(setupRatedUsageDocs(ratedUsage), done);
    });

    it('shifts windows', function(done) {
      this.timeout(testEnv.totalTimeout + 2000);
      checkReport(expectedReport, done);
    });
  });

  context.only('with previous month time', () => {
    const now = moment.utc().startOf('month').add(12, 'days').valueOf();
    const endPrevMonth = moment.utc(now).subtract(1, 'month').endOf('month').valueOf();
    
    const checkReportAt = (reportTime, offset) => {
      const _replaceTimePart = (string) => {
        const parts = string.split('-');
        parts[0] = dbclient.pad16(now);
        return parts.join('-');
      };
  
      const _changeTimestamps = (doc) => {
        if (doc.spaces) {
          if (doc.spaces.consumers)
            doc.spaces[0].consumers[0].t = dbclient.pad16(now);
          if (doc.spaces.t)
            doc.spaces.t = _replaceTimePart(doc.spaces.t);
        }
      
        // Space document
        if (doc.consumers && doc.consumers.t)
          doc.consumers.t = _replaceTimePart(doc.consumers.t);
      
        return doc;
      };
  
      const _setupRatedUsageDocs = (templates, times) => {
        const ratedDocs = [];
        for(let template of templates) {
          const newId = dbclient.kturi(dbclient.k(template.id), times.end);
          const newAccumulatedId = dbclient.tkuri(dbclient.k(template.accumulated_usage_id), times.end + '-0-0-1-0');
          const doc = extend({}, template, {
            id: newId,
            _id: newId,
            accumulated_usage_id: newAccumulatedId,
            start: times.start,
            end: times.end,
            processed: times.processed
          });
      
          ratedDocs.push(_changeTimestamps(doc));
        }
      
        return ratedDocs;
      };
  
      const _uploadRatedUsage = (usage, done) => {
        debug('Uploading rated docs ...');
        dbBulk(usage, {}, (err, val) => {
          expect(err).to.equal(null);
          expect(val).to.not.equal(undefined);
      
          debug('Uploaded rated documents');
          done();
        });
      };

      const _setupReport = (report, times) => extend({}, report, {
        id: dbclient.kturi(dbclient.k(report.id), times.end),
        start: times.start,
        end: times.end,
        processed: times.processed
      });
  
      const _getReport = (orgId, cb) => {
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
  
      const _verifyReports = (expectedReport, cb) => {
        const orgId = ratedUsage[0].organization_id;
        _getReport(orgId, (report) => {
          expect(report, `Report for ${orgId} does not match`).to.deep.equal(expectedReport);
          cb();
        });
      };
  
      const _checkReport = (expectedReport, done) => {
        request.waitFor('http://localhost::p/batch', { p: 9088 }, testEnv.startTimeout, (err) => {
          if (err) throw err;
          _verifyReports(expectedReport, done);
        });
      };

      return {
        ofAggregatedusage: (msg, times, report) => context(`of aggregated usage ${msg}`, () => {
          beforeEach((done) => {
            if(offset) 
              process.env.ABACUS_TIME_OFFSET = offset;
            lifecycleManager.useEnv(process.env).startModules([
              lifecycleManager.modules.accountPlugin,
              lifecycleManager.modules.reporting
            ]);
    
            _uploadRatedUsage(_setupRatedUsageDocs(ratedUsage, times), done);
          });
    
          it('reports correct rated usage submissions', function(done) {
            this.timeout(testEnv.totalTimeout + 2000);
            const expectedReport = _setupReport(report, times);
            _checkReport(expectedReport, done);
          });
        })
      };
    };

    const nowTimes = { start: now, end: now, processed: now };
    checkReportAt(now).ofAggregatedusage('processed now', nowTimes, todaysReport);

    const offset = 4 * 24 * 60 * 60 * 1000; // 4 days
    const reportTime = now + offset + 1;
    checkReportAt(reportTime, offset).ofAggregatedusage('processed now', nowTimes, futureReport);

    const currentMonthTimes = { start: endPrevMonth, end: endPrevMonth, processed: now };
    checkReportAt(endPrevMonth).ofAggregatedusage('processed now', currentMonthTimes, todaysReport);
    
    const previousMonthTimes = { start: endPrevMonth, end: endPrevMonth, processed: endPrevMonth };
    checkReportAt(endPrevMonth).ofAggregatedusage('processed previous month', previousMonthTimes, todaysReport);
  });
});
