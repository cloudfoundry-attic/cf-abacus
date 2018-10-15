'use strict';

const uuid = require('uuid');
const { bind } = require('underscore');

const { ConflictError } = require('abacus-api');

const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

class ConflictingStartError extends Error {
  constructor() {
    super('conflicting start event');
    Error.captureStackTrace(this, ConflictingStartError);
  }
};

class ConflictingEndError extends Error {
  constructor() {
    super('conflicting end event');
    Error.captureStackTrace(this, ConflictingEndError);
  }
};

class MissingSpanError extends Error {
  constructor() {
    super('span missing');
    Error.captureStackTrace(this, MissingSpanError);
  }
};

class OutOfOrderError extends Error {
  constructor() {
    super('event is out of order');
    Error.captureStackTrace(this, OutOfOrderError);
  }
};

class ConflictingMappingError extends Error {
  constructor() {
    super('plan mapping exists');
    Error.captureStackTrace(this, ConflictingMappingError);
  }
};

class Controller {
  constructor(opts) {
    this.spanDAO = opts.spanDAO;
    this.provisioningClient = opts.provisioningClient;
  }

  async handleStart(event) {
    const target = this._extractTarget(event);
    const startApplied = await this.spanDAO.startSpan(
      event.timestamp,
      target,
      event.measured_usage,
      event.id
    );
    if (!startApplied && !await this._isDuplicateStart(event))
      throw new ConflictingStartError();
  }

  async handleStop(event) {
    const target = this._extractTarget(event);
    const span = await this.spanDAO.getSpanByTarget(target);
    if (!span)
      if (!await this._isDuplicateEnd(event))
        throw new MissingSpanError();
      else
        return;
    if (event.timestamp < span.start)
      throw new OutOfOrderError();
    const endApplied = await this.spanDAO.endSpan(event.timestamp, target, uuid.v4(), event.id);
    if (!endApplied && !await this._isDuplicateEnd(event))
      throw new ConflictingEndError();
  }

  async handleMappings(resourceID, planID, meteringPlan, ratingPlan, pricingPlan) {
    const meteringPlanMapped = await this._handleMapping(
      bind(this.provisioningClient.mapMeteringPlan, this.provisioningClient),
      resourceID, planID, meteringPlan);
    const ratingPlanMapped = await this._handleMapping(
      bind(this.provisioningClient.mapRatingPlan, this.provisioningClient),
      resourceID, planID, ratingPlan);
    const pricingPlanMapped = await this._handleMapping(
      bind(this.provisioningClient.mapPricingPlan, this.provisioningClient),
      resourceID, planID, pricingPlan);

    if (!meteringPlanMapped && !ratingPlanMapped && !pricingPlanMapped)
      throw new ConflictingMappingError();
  }

  async _handleMapping(mappingFn, resourceID, planID, plan) {
    try {
      await mappingFn(resourceID, planID, plan);
      return true;
    } catch (e) {
      if (e instanceof ConflictError)
        return false;
     
      throw e;
    }
  }

  async _isDuplicateStart(event) {
    return await this.spanDAO.existsSpanWithStartDedupID(event.id);
  }

  async _isDuplicateEnd(event) {
    return await this.spanDAO.existsSpanWithEndDedupID(event.id);
  }

  _extractTarget(event) {
    return {
      organization_id: event.organization_id,
      space_id: event.space_id,
      consumer_id: event.consumer_id,
      resource_id: event.resource_id,
      plan_id: event.plan_id,
      resource_instance_id: event.resource_instance_id,
      correlation_id: ZERO_GUID
    };
  }
};

module.exports = {
  ConflictingStartError,
  ConflictingEndError,
  MissingSpanError,
  OutOfOrderError,
  ConflictingMappingError,
  Controller
};
