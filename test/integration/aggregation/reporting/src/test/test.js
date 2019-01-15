'use strict';

const { extend } = require('underscore');

const request = require('abacus-request');
const dbclient = require('abacus-dbclient');
const lifecycleManager = require('abacus-lifecycle-manager')();
const moment = require('abacus-moment');
const partition = require('abacus-partition');

const httpStatus = require('http-status-codes');
const util = require('util');

const debug = require('abacus-debug')('abacus-usage-reporting-itest');

const testEnv = {
  db: process.env.DB_URI || 'mongodb://localhost:27017',
  offset: () => process.env.ABACUS_TIME_OFFSET ? parseInt(process.env.ABACUS_TIME_OFFSET) : 0,
  startTimeout: process.env.START_TIMEOUT || 30000,
  totalTimeout: process.env.TOTAL_TIMEOUT || 60000
};

const forward = (n) => partition.createForwardFn(n, 4000);

const dbpartitions = (n) => n ? n : process.env.DB_PARTITIONS ? parseInt(process.env.DB_PARTITIONS) : 1;

const dbpartition = (n) =>
  partition.partitioner(partition.bucket, partition.period, forward(dbpartitions(n)), partition.balance);

const aggregatorDB = 
  dbclient(dbpartition(), dbclient.dburi(testEnv.db, 'abacus-aggregator-aggregated-usage'));

const dbBulk = util.promisify(aggregatorDB.bulkDocs);
const dropDatabase = util.promisify(dbclient.drop);

const doGet = util.promisify(request.get);

const ratedUsage = require('./ratedUsage.json');

const todaysReport = require('./report.json');
const futureReport = require('./offset_report.json');

describe('Reporting integration test', () => {
  beforeEach(async() => {
    await dropDatabase(testEnv.db, /^abacus-aggregator-/);
  });

  afterEach(() => {
    lifecycleManager.stopAllStarted();
  });

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

    const _uploadRatedUsage = async(usage) => {
      debug('Uploading rated docs ...');
      const res = await dbBulk(usage, {});
      expect(res).to.not.equal(undefined);
      debug('Uploaded rated documents');
    };

    const _setupReport = (report, times) => extend({}, report, {
      id: dbclient.kturi(dbclient.k(report.id), times.end),
      start: times.start,
      end: times.end,
      processed: times.processed
    });

    const retrieveReport = async (orgID, timestamp = moment.now()) => {
      const resp = await doGet('/v1/metering/organizations/:organization_id/aggregated/usage/:timestamp', {
        baseUrl: 'http://localhost:9088',
        organization_id: orgID,
        timestamp: timestamp
      });
      expect(resp.statusCode).to.be.oneOf([httpStatus.OK, httpStatus.PARTIAL_CONTENT]);
      return resp.body;
    };

    return {
      ofAggregatedUsage: (msgContext, msgIt, times, report) => context(msgContext, () => {
        beforeEach(async() => {
          if(offset) 
            process.env.ABACUS_TIME_OFFSET = offset;
          lifecycleManager.useEnv(process.env).startModules([
            lifecycleManager.modules.accountPlugin,
            lifecycleManager.modules.reporting
          ]);
          
          await _uploadRatedUsage(_setupRatedUsageDocs(ratedUsage, times));
        });
  
        it(msgIt, async function () {
          this.timeout(testEnv.totalTimeout + 2000);
          const orgID = ratedUsage[0].organization_id;
          const expectedReport = _setupReport(report, times);
          await eventually(async() => {
            const actual = await retrieveReport(orgID, reportTime);
            expect(actual, `Report for ${orgID} does not match`).to.deep.equal(expectedReport);
          });
        });
      })
    };
  };

  const nowTimes = { start: now, end: now, processed: now };
  checkReportAt(now).ofAggregatedUsage('when usages for current month are processed in current month',
    'current month report is correct', nowTimes, todaysReport);

  const fourDaysOffset = 4 * 24 * 60 * 60 * 1000; 
  const reportTime = now + fourDaysOffset + 1;
  checkReportAt(reportTime, fourDaysOffset).ofAggregatedUsage(
    'when usages for current month are processed in current month', 'getting report with future timestamps is correct',
    nowTimes, futureReport);

  const currentMonthTimes = { start: endPrevMonth, end: endPrevMonth, processed: now };
  checkReportAt(endPrevMonth).ofAggregatedUsage(
    'when usages for previous month are processed in current month', 'prevous month report is correct', 
    currentMonthTimes, todaysReport);
  
  const previousMonthTimes = { start: endPrevMonth, end: endPrevMonth, processed: endPrevMonth };
  checkReportAt(endPrevMonth).ofAggregatedUsage('when usages for previous month are processed in previous month', 
    'previous month report is correct', previousMonthTimes, todaysReport);
});
