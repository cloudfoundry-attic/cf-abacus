'use strict';

const httpStatus = require('http-status-codes');
const EventEmitter = require('events');

const {
  ConflictingStartError,
  ConflictingEndError,
  ConflictingMappingError,
  MissingSpanError,
  OutOfOrderError
} = require('./controller');

const { InvalidEventError } = require('./event-schema-validator');
const { OutOfSlackError } = require('./slack-validator');

const edebug = require('abacus-debug')('e-abacus-sampler-receiver-presenter');

const events = {
  start: {
    successful: 'start.successful',
    invalidEvent: 'start.error.invalid-event',
    outOfSlack: 'start.error.out-of-slack',
    conflict: 'start.error.conflict',
    failure: 'start.failure'
  },
  stop: {
    successful: 'stop.successful',
    invalidEvent: 'stop.error.invalid-event',
    conflict: 'stop.error.conflict',
    missingSpan: 'stop.error.missing-span',
    outOfOrder: 'stop.error.out-of-order',
    failure: 'stop.failure'
  },
  mappings: {
    successful: 'mappings.successful',
    conflict: 'mappings.error.conflict',
    failure: 'mappings.failure'
  }
};

class Presenter {
  constructor(controller, schemaValidator, slackValidator) {
    this.controller = controller;
    this.schemaValidator = schemaValidator;
    this.slackValidator = slackValidator;

    this.emitter = new EventEmitter();
  }

  async handleStart(req, resp) {
    try {
      const event = req.body;
      this.schemaValidator.validateStartEvent(event);
      this.slackValidator.validate(event.timestamp);

      await this.controller.handleStart(event);
      resp.status(httpStatus.CREATED).send();
      this.emitter.emit(events.start.successful);
    } catch (e) {
      if (e instanceof InvalidEventError) {
        resp.status(httpStatus.BAD_REQUEST).send();
        this.emitter.emit(events.start.invalidEvent);
        return;
      }
      if (e instanceof OutOfSlackError) {
        resp.status(httpStatus.UNPROCESSABLE_ENTITY).send();
        this.emitter.emit(events.start.outOfSlack);
        return;
      }
      if (e instanceof ConflictingStartError) {
        resp.status(httpStatus.CONFLICT).send();
        this.emitter.emit(events.start.conflict);
        return;
      }
      edebug('controller failed to handle start: %s', e.message);
      resp.status(httpStatus.INTERNAL_SERVER_ERROR).send();
      this.emitter.emit(events.start.failure);
    }
  }

  async handleStop(req, resp) {
    try {
      const event = req.body;
      this.schemaValidator.validateStopEvent(event);
      await this.controller.handleStop(event);
      resp.status(httpStatus.CREATED).send();
      this.emitter.emit(events.stop.successful);
    } catch (e) {
      if (e instanceof InvalidEventError) {
        resp.status(httpStatus.BAD_REQUEST).send();
        this.emitter.emit(events.stop.invalidEvent);
        return;
      }
      if (e instanceof ConflictingEndError) {
        resp.status(httpStatus.CONFLICT).send();
        this.emitter.emit(events.stop.conflict);
        return;
      }
      if (e instanceof MissingSpanError) {
        resp.status(httpStatus.UNPROCESSABLE_ENTITY).send();
        this.emitter.emit(events.stop.missingSpan);
        return;
      }
      if (e instanceof OutOfOrderError) {
        resp.status(httpStatus.UNPROCESSABLE_ENTITY).send();
        this.emitter.emit(events.stop.outOfOrder);
        return;
      }
      edebug('controller failed to handle stop: %s', e.message);
      resp.status(httpStatus.INTERNAL_SERVER_ERROR).send();
      this.emitter.emit(events.stop.failure);
    }
  }

  async handleMappings(req, resp) {
    const mapping = req.body;
    try {
      await this.controller.handleMappings(
        mapping.resource_id,
        mapping.plan_id,
        mapping.metering_plan,
        mapping.rating_plan,
        mapping.pricing_plan
      );
      resp.status(httpStatus.CREATED).send();
      this.emitter.emit(events.mappings.successful);
    } catch (e) {
      if (e instanceof ConflictingMappingError) {
        resp.status(httpStatus.CONFLICT).send();
        this.emitter.emit(events.mappings.conflict);
        return;
      }
      edebug('controller failed to handle mappings: %s', e.message);
      resp.status(httpStatus.INTERNAL_SERVER_ERROR).send();
      this.emitter.emit(events.mappings.failure);
    }
  }

  on(eventName, listener) {
    this.emitter.on(eventName, listener);
  }
}

module.exports = {
  Presenter,
  events
};
