'use strict';

const httpStatus = require('http-status-codes');
const {
  ConflictingStartError,
  ConflictingEndError,
  ConflictingMappingError,
  MissingSpanError,
  OutOfOrderError
} = require('../lib/controller');

const edebug = require('abacus-debug')('e-abacus-sampler-collector-presenter');

class Presenter {
  constructor(controller) {
    this.controller = controller;
  }

  async handleStart(req, resp) {
    try {
      await this.controller.handleStart(req.body);
      resp.status(httpStatus.CREATED).send();
    } catch (e) {
      if (e instanceof ConflictingStartError) {
        resp.status(httpStatus.CONFLICT).send();
        return;
      }
      edebug('controller failed to handle start: %s', e.message);
      resp.status(httpStatus.INTERNAL_SERVER_ERROR).send();
    }
  }

  async handleStop(req, resp) {
    try {
      await this.controller.handleStop(req.body);
      resp.status(httpStatus.CREATED).send();
    } catch (e) {
      if (e instanceof ConflictingEndError) {
        resp.status(httpStatus.CONFLICT).send();
        return;
      }
      if (e instanceof MissingSpanError || e instanceof OutOfOrderError) {
        resp.status(httpStatus.UNPROCESSABLE_ENTITY).send();
        return;
      }
      edebug('controller failed to handle stop: %s', e.message);
      resp.status(httpStatus.INTERNAL_SERVER_ERROR).send();
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
    } catch (e) {
      if (e instanceof ConflictingMappingError) {
        resp.status(httpStatus.CONFLICT).send();
        return;
      }
      edebug('controller failed to handle mappings: %s', e.message);
      resp.status(httpStatus.INTERNAL_SERVER_ERROR).send();
    }
  }
};

module.exports = {
  Presenter
};
