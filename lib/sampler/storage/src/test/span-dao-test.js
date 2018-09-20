'use strict';

const { MongoClient } = require('mongodb');
const { extend } = require('underscore');
const uuid = require('uuid');
const moment = require('abacus-moment');
const { Aug } = moment;
const { createSpanDAO } = require('../lib/span-dao');
const { createRandomTarget, spanPageObject } = require('./helpers/span-po');

const mongoURI = process.env.DB || 'mongodb://localhost:27017';

describe('span-dao', () => {
  const collectionName = 'span-dao-test-spans';

  let client;
  let dao;

  let startDedupID;
  let endDedupID;
  let startTimestamp;
  let endTimestamp;
  let target;
  let measures;
  let plannedInterval;
  let processedInterval;

  before(async () => {
    client = await MongoClient.connect(mongoURI);
  });

  after(async () => {
    await client.close();
  });

  beforeEach(async () => {
    dao = await createSpanDAO(client, collectionName);

    startDedupID = uuid.v4();
    endDedupID = uuid.v4();
    startTimestamp = moment.now();
    endTimestamp = startTimestamp + 1000;
    target = createRandomTarget();
    measures = [
      {
        measure: 'api_calls',
        quantity: 128
      }
    ];
    plannedInterval = {
      start: 10, // irrelevant
      end: 20 // irrelevant
    };
    processedInterval = {
      start: 30, // irrelevant
      end: 40 // irrelevant
    };
  });

  afterEach(async () => {
    await client.collection(collectionName).drop();
  });

  it('is possible to create dao twice', async () => {
    await createSpanDAO(client, collectionName);
  });

  describe('#startSpan', () => {
    it('is successful for spans without a dedup id', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();
    });

    it('is successful for spans with a dedup id', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures, startDedupID).verify();
    });

    it('is successful when two spans have different targets and dedup ids', async () => {
      const firstSpanPO = spanPageObject(dao, createRandomTarget());
      await firstSpanPO.startSpan(startTimestamp, measures, uuid.v4()).verify();

      const secondSpanPO = spanPageObject(dao, createRandomTarget());
      await secondSpanPO.startSpan(startTimestamp, measures, uuid.v4()).verify();
    });

    it('is unsuccessful when a span with the same target exists', async () => {
      const firstSpanPO = spanPageObject(dao, target);
      await firstSpanPO.startSpan(startTimestamp, measures).verify();

      const secondSpanPO = spanPageObject(dao, target);
      const startSuccess = await secondSpanPO.startSpan(startTimestamp, measures).result();
      expect(startSuccess).to.equal(false);
    });

    it('is unsuccessful when a span with the same dedup id exists', async () => {
      const firstSpanPO = spanPageObject(dao, createRandomTarget());
      await firstSpanPO.startSpan(startTimestamp, measures, startDedupID).verify();

      const secondSpanPO = spanPageObject(dao, createRandomTarget());
      const startSuccess = await secondSpanPO.startSpan(startTimestamp, measures, startDedupID).result();
      expect(startSuccess).to.equal(false);
    });
  });

  describe('#endSpan', () => {
    it('is successful when the span exists', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();

      const newCorrelationID = uuid.v4();
      await spanPO.endSpan(endTimestamp, newCorrelationID).verify();

      // span has had it's target changed, hence this page object cannot find it anymore
      const span = await spanPO.getSpan().result();
      expect(span).to.equal(undefined);

      // we need to find the renamed span
      const renamedSpanPO = spanPageObject(dao, extend({}, target, {
        correlation_id: newCorrelationID
      }));
      const renamedSpan = await renamedSpanPO.getSpan().verify();
      expect(renamedSpan.end).to.equal(endTimestamp);
    });

    it('is successful when the span exists and a dedup id is specified', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();

      const newCorrelationID = uuid.v4();
      await spanPO.endSpan(endTimestamp, newCorrelationID, endDedupID).verify();
    });

    it('is unsuccessful when the targeted span has already been ended', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();
      await spanPO.endSpan(endTimestamp, target.correlation_id).verify();

      const duplicateEndSuccess = await spanPO.endSpan(endTimestamp, target.correlation_id).result();
      expect(duplicateEndSuccess).to.equal(false);
    });

    it('is unsuccessful when the targeted span does not exist', async () => {
      const spanPO = spanPageObject(dao, target);
      const endSuccess = await spanPO.endSpan(endTimestamp, target.correlation_id).result();
      expect(endSuccess).to.equal(false);
    });

    it('is unsuccessful when a span with the given end dedup id exists', async () => {
      const firstSpanPO = spanPageObject(dao, createRandomTarget());
      await firstSpanPO.startSpan(startTimestamp, measures).verify();
      await firstSpanPO.endSpan(endTimestamp, uuid.v4(), endDedupID).verify();

      const secondSpanPO = spanPageObject(dao, createRandomTarget());
      await secondSpanPO.startSpan(startTimestamp, measures).verify();
      const endSuccess = await secondSpanPO.endSpan(endTimestamp, uuid.v4(), endDedupID).result();
      expect(endSuccess).to.equal(false);
    });
  });

  describe('#deleteSpansByIDs', () => {
    it('is possible to delete multiple spans by their mongo ids', async () => {
      const firstSpanPO = spanPageObject(dao, createRandomTarget());
      await firstSpanPO.startSpan(startTimestamp, measures).verify();

      const secondSpanPO = spanPageObject(dao, createRandomTarget());
      await secondSpanPO.startSpan(startTimestamp, measures).verify();

      const thirdSpanPO = spanPageObject(dao, createRandomTarget());
      await thirdSpanPO.startSpan(startTimestamp, measures).verify();

      await dao.deleteSpansByIDs([
        (await firstSpanPO.getSpan().verify())._id,
        (await thirdSpanPO.getSpan().verify())._id
      ]);

      const firstSpan = await firstSpanPO.getSpan().result();
      expect(firstSpan).to.equal(undefined);

      await secondSpanPO.getSpan().verify();

      const thirdSpan = await thirdSpanPO.getSpan().result();
      expect(thirdSpan).to.equal(undefined);
    });

    it('is a noop to delete a set of missing documents', async () => {
      await dao.deleteSpansByIDs([
        uuid.v4(),
        uuid.v4()
      ]);
    });
  });

  describe('#getSpanByTarget', () => {
    it('returns the span when it exists', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();

      const job = await spanPO.getSpan().verify();
      expect(job.target).to.deep.equal(target);
      expect(job.measured_usage).to.deep.equal(measures);
      expect(job.start).to.equal(startTimestamp);
      expect(job.start_dedup_id).to.equal(undefined);
      expect(job.end).to.equal(null);
      expect(job.end_dedup_id).to.equal(undefined);
      expect(job.processing.complete).to.equal(false);
      expect(job.processing.last_interval).to.deep.equal({
        start: startTimestamp,
        end: startTimestamp
      });
      expect(job.processing.planned_interval).to.equal(null);
      expect(job.processing.last_change_at).to.be.closeTo(moment.now(), 10000);
      expect(job.processing.version).to.equal(1);
    });

    it('returns undefined when the span does not exist', async () => {
      const spanPO = spanPageObject(dao, target);
      const job = await spanPO.getSpan().result();
      expect(job).to.equal(undefined);
    });
  });

  describe('#existsSpanWithStartDedupID', () => {
    it('returns true when a span with the given dedup id exists', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures, startDedupID).verify();

      const exists = await dao.existsSpanWithStartDedupID(startDedupID);
      expect(exists).to.equal(true);
    });

    it('returns false when no span with the given dedup id exists', async () => {
      const exists = await dao.existsSpanWithStartDedupID(startDedupID);
      expect(exists).to.equal(false);
    });

    it('returns false when specified id is undefined', async () => {
      const exists = await dao.existsSpanWithStartDedupID(undefined);
      expect(exists).to.equal(false);
    });
  });

  describe('#existsSpanWithEndDedupID', () => {
    it('returns true when a span with the given end dedup id exists', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();
      await spanPO.endSpan(endTimestamp, uuid.v4(), endDedupID).verify();

      const exists = await dao.existsSpanWithEndDedupID(endDedupID);
      expect(exists).to.equal(true);
    });

    it('returns false when no span with the given end dedup id exists', async () => {
      const exists = await dao.existsSpanWithEndDedupID(endDedupID);
      expect(exists).to.equal(false);
    });

    it('returns false when specified id is undefined', async () => {
      const exists = await dao.existsSpanWithEndDedupID(undefined);
      expect(exists).to.equal(false);
    });
  });

  describe('#updateSpanPlannedInterval', () => {
    it('is successful when the targeted span has not been modified concurrently', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();
      const prePlanSpan = await spanPO.getSpan().verify();
      await spanPO.updateSpanPlannedInterval(plannedInterval, 1).verify();
      const span = await spanPO.getSpan().verify();
      expect(span.processing.complete).to.equal(false);
      expect(span.processing.last_interval).to.deep.equal(prePlanSpan.processing.last_interval);
      expect(span.processing.planned_interval).to.deep.equal(plannedInterval);
      expect(span.processing.last_change_at).to.be.above(prePlanSpan.processing.last_change_at);
      expect(span.processing.version).to.equal(2);
    });

    it('is unsuccessful when the targeted span has been modified concurrently', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();
      await spanPO.updateSpanPlannedInterval(plannedInterval, 1).verify();

      const concurrentPlannedInterval = {
        start: 0,
        end: 0
      };
      const concurrentUpdateSuccess = await spanPO.updateSpanPlannedInterval(concurrentPlannedInterval, 1).result();
      expect(concurrentUpdateSuccess).to.equal(false);

      const span = await spanPO.getSpan().verify();
      expect(span.processing.planned_interval).to.deep.equal(plannedInterval);
    });
  });

  describe('#updateSpanProcessedInterval', () => {
    it('is successful when the targeted span has not been modified concurrently', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();
      await spanPO.updateSpanPlannedInterval(plannedInterval, 1).verify();
      const preProcessSpan = await spanPO.getSpan().verify();
      await spanPO.updateSpanProcessedInterval(processedInterval, true, 2).verify();
      const postProcessSpan = await spanPO.getSpan().verify();
      expect(postProcessSpan.processing.complete).to.equal(true);
      expect(postProcessSpan.processing.last_interval).to.deep.equal(processedInterval);
      expect(postProcessSpan.processing.planned_interval).to.deep.equal(null);
      expect(postProcessSpan.processing.last_change_at).to.be.above(preProcessSpan.processing.last_change_at);
      expect(postProcessSpan.processing.version).to.equal(3);
    });

    it('is unsuccessful when the targeted span has been modified concurrently', async () => {
      const spanPO = spanPageObject(dao, target);
      await spanPO.startSpan(startTimestamp, measures).verify();
      await spanPO.updateSpanPlannedInterval(plannedInterval, 1).verify();
      await spanPO.updateSpanProcessedInterval(processedInterval, true, 2).verify();

      const concurrentInterval = {
        start: 0,
        end: 0
      };
      const concurrentSuccess = await spanPO.updateSpanProcessedInterval(concurrentInterval, true, 2).result();
      expect(concurrentSuccess).to.equal(false);

      const span = await spanPO.getSpan().verify();
      expect(span.processing.last_interval).to.deep.equal(processedInterval);
    });
  });

  describe('#findIncompleteSpans', () => {
    let firstTarget;
    let secondTarget;
    let thirdTarget;

    beforeEach(async () => {
      firstTarget = createRandomTarget();
      const firstSpanPO = spanPageObject(dao, firstTarget);
      await firstSpanPO.startSpan(startTimestamp, measures).verify();
      const firstInterval = {
        start: startTimestamp,
        end: moment.utcTimestamp(2018, Aug, 13, 12, 0, 0, 0)
      };
      await firstSpanPO.updateSpanProcessedInterval(firstInterval, false, 1).verify();

      secondTarget = createRandomTarget();
      const secondSpanPO = spanPageObject(dao, secondTarget);
      await secondSpanPO.startSpan(startTimestamp, measures).verify();
      const secondInterval = {
        start: startTimestamp,
        end: moment.utcTimestamp(2018, Aug, 13, 14, 0, 0, 0)
      };
      await secondSpanPO.updateSpanProcessedInterval(secondInterval, false, 1).verify();

      thirdTarget = createRandomTarget();
      const thirdSpanPO = spanPageObject(dao, thirdTarget);
      await thirdSpanPO.startSpan(startTimestamp, measures).verify();
      const thirdInterval = {
        start: startTimestamp,
        end: moment.utcTimestamp(2018, Aug, 13, 16, 0, 0, 0)
      };
      await thirdSpanPO.updateSpanProcessedInterval(thirdInterval, true, 1).verify();
    });

    it('returns only spans that are sampled earlier than specified', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 12, 0, 0, 1);
      const spans = await dao.findIncompleteSpans(before, 0, 3);
      expect(spans.length).to.equal(1);
      expect(spans[0].target).to.deep.equal(firstTarget);
    });

    it('returns multiple spans, when applicable', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 14, 0, 0, 1);
      const spans = await dao.findIncompleteSpans(before, 0, 3);
      expect(spans.length).to.equal(2);
      expect(spans[0].target).to.deep.equal(firstTarget);
      expect(spans[1].target).to.deep.equal(secondTarget);
    });

    it('returns only spans that are not yet complete', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 16, 0, 0, 1);
      const spans = await dao.findIncompleteSpans(before, 0, 3);
      expect(spans.length).to.equal(2);
      expect(spans[0].target).to.deep.equal(firstTarget);
      expect(spans[1].target).to.deep.equal(secondTarget);
    });

    it('returns no candiates, if there are no matching', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 12, 0, 0, 0);
      const spans = await dao.findIncompleteSpans(before, 0, 3);
      expect(spans.length).to.equal(0);
    });

    it('returns spans according to the limit setting', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 14, 0, 0, 1);
      const spans = await dao.findIncompleteSpans(before, 0, 1);
      expect(spans.length).to.equal(1);
      expect(spans[0].target).to.deep.equal(firstTarget);
    });

    it('returns spans according to the offset setting', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 14, 0, 0, 1);
      const spans = await dao.findIncompleteSpans(before, 1, 3);
      expect(spans.length).to.equal(1);
      expect(spans[0].target).to.deep.equal(secondTarget);
    });
  });

  describe('#findCompleteSpans', () => {
    let firstTarget;
    let secondTarget;
    let thirdTarget;

    beforeEach(async () => {
      firstTarget = createRandomTarget();
      const firstSpanPO = spanPageObject(dao, firstTarget);
      await firstSpanPO.startSpan(startTimestamp, measures).verify();
      const firstInterval = {
        start: startTimestamp,
        end: moment.utcTimestamp(2018, Aug, 13, 12, 0, 0, 0)
      };
      await firstSpanPO.updateSpanProcessedInterval(firstInterval, true, 1).verify();

      secondTarget = createRandomTarget();
      const secondSpanPO = spanPageObject(dao, secondTarget);
      await secondSpanPO.startSpan(startTimestamp, measures).verify();
      const secondInterval = {
        start: startTimestamp,
        end: moment.utcTimestamp(2018, Aug, 13, 14, 0, 0, 0)
      };
      await secondSpanPO.updateSpanProcessedInterval(secondInterval, true, 1).verify();

      thirdTarget = createRandomTarget();
      const thirdSpanPO = spanPageObject(dao, thirdTarget);
      await thirdSpanPO.startSpan(startTimestamp, measures).verify();
      const thirdInterval = {
        start: startTimestamp,
        end: moment.utcTimestamp(2018, Aug, 13, 16, 0, 0, 0)
      };
      await thirdSpanPO.updateSpanProcessedInterval(thirdInterval, false, 1).verify();
    });

    it('returns only spans that are sampled earlier than specified', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 12, 0, 0, 1);
      const spans = await dao.findCompleteSpans(before, 0, 3);
      expect(spans.length).to.equal(1);
      expect(spans[0].target).to.deep.equal(firstTarget);
    });

    it('returns multiple spans, when applicable', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 14, 0, 0, 1);
      const spans = await dao.findCompleteSpans(before, 0, 3);
      expect(spans.length).to.equal(2);
      expect(spans[0].target).to.deep.equal(firstTarget);
      expect(spans[1].target).to.deep.equal(secondTarget);
    });

    it('returns only spans that are not yet complete', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 16, 0, 0, 1);
      const spans = await dao.findCompleteSpans(before, 0, 3);
      expect(spans.length).to.equal(2);
      expect(spans[0].target).to.deep.equal(firstTarget);
      expect(spans[1].target).to.deep.equal(secondTarget);
    });

    it('returns no candiates, if there are no matching', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 12, 0, 0, 0);
      const spans = await dao.findCompleteSpans(before, 0, 3);
      expect(spans.length).to.equal(0);
    });

    it('returns spans according to the limit setting', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 14, 0, 0, 1);
      const spans = await dao.findCompleteSpans(before, 0, 1);
      expect(spans.length).to.equal(1);
      expect(spans[0].target).to.deep.equal(firstTarget);
    });

    it('returns spans according to the offset setting', async () => {
      const before = moment.utcTimestamp(2018, Aug, 13, 14, 0, 0, 1);
      const spans = await dao.findCompleteSpans(before, 1, 3);
      expect(spans.length).to.equal(1);
      expect(spans[0].target).to.deep.equal(secondTarget);
    });
  });
});
