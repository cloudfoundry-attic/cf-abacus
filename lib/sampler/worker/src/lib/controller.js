'use strict';

const moment = require('abacus-moment');
const { map } = require('underscore');
const uuid = require('uuid');
const debug = require('abacus-debug')('abacus-sampler-worker');

class Processor {
  constructor(opts) {
    this.abacusClient = opts.abacusClient;
    this.dao = opts.spanDAO;
    this.sampler = opts.sampler;
  }

  async processSpan(span) {
    if (span.processing.planned_interval)
      await this._processPlannedSpan(span);
    else
      await this._processUnplannedSpan(span);
  }

  async _processPlannedSpan(span) {
    const usageTimestamp = Math.floor(
      (span.processing.planned_interval.start + span.processing.planned_interval.end) / 2
    );
    await this.abacusClient.postUsage({
      dedup_id: span.processing.planned_interval.usage_guid,
      start: usageTimestamp,
      end: usageTimestamp,
      organization_id: span.target.organization_id,
      space_id: span.target.space_id,
      consumer_id: span.target.consumer_id,
      resource_id: span.target.resource_id,
      plan_id: span.target.plan_id,
      resource_instance_id: span.target.resource_instance_id,
      measured_usage: span.measured_usage.concat([
        {
          measure: 'duration',
          quantity: span.processing.planned_interval.end - span.processing.planned_interval.start
        }
      ])
    });

    const success = await this.dao.updateSpanProcessedInterval(
      span._id,
      span.processing.planned_interval,
      span.processing.planned_interval.end === span.end,
      span.processing.version
    );
    if (!success)
      debug('optimistic concurrency check rejection on span (id: %s) execution', span._id);
  }

  async _processUnplannedSpan(span) {
    const samplingEnd = this.sampler.calculateNextIntervalEnd(
      span.processing.last_interval.end,
      span.end
    );
    const plannedInterval = {
      start: span.processing.last_interval.end,
      end: samplingEnd,
      usage_guid: uuid.v4()
    };

    const success = await this.dao.updateSpanPlannedInterval(
      span._id,
      plannedInterval,
      span.processing.version
    );
    if (!success)
      debug('optimistic concurrency check rejection on span (id: %s) planning', span._id);
  }
}

class Controller {
  constructor(opts) {
    this.dao = opts.spanDAO;
    this.processor = opts.processor || new Processor({
      abacusClient: opts.abacusClient,
      dao: opts.spanDAO,
      sampler: opts.sampler
    });
    this.samplingDimension = opts.samplingDimension;
    this.processingBatchOffset = opts.processingBatchOffset;
    this.processingBatchSize = opts.processingBatchSize;
    this.cleanupBatchOffset = opts.cleanupBatchOffset;
    this.cleanupBatchSize = opts.cleanupBatchSize;
    this.cleanupAge = opts.cleanupAge;
  }

  async processSpans() {
    const before = moment.utc().subtract(1, this.samplingDimension).valueOf();
    const spans = await this.dao.findIncompleteSpans(
      before,
      this.processingBatchOffset,
      this.processingBatchSize
    );

    for (let span of spans)
      await this.processor.processSpan(span);
  }

  async cleanupSpans() {
    const before = moment.utc().subtract(this.cleanupAge, 'ms').valueOf();
    const spans = await this.dao.findCompleteSpans(
      before,
      this.cleanupBatchOffset,
      this.cleanupBatchSize
    );
    const ids = map(spans, (span) => span._id);
    if (ids.length > 0) {
      debug('cleaning up %d spans', ids.length);
      await this.dao.deleteSpansByIDs(ids);
    }
  }
}

module.exports = {
  Controller,
  Processor
};
