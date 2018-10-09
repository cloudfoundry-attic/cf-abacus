'use strict';

const { objectType, string, arrayOf, anyType, time, required, json } = require('abacus-schema');
const validator = require('is-my-json-valid');

class InvalidEventError extends Error {
  constructor() {
    super('invalid event');
    Error.captureStackTrace(this, InvalidEventError);
  }
};

const measure = () =>
  objectType('measure', {
    measure: required(string()),
    quantity: required(anyType('quantity'))
  });

const isValidStartEvent = validator(json(
  objectType('startEvent', {
    id: string(),
    timestamp: required(time()),
    organization_id: required(string()),
    space_id: required(string()),
    consumer_id: required(string()),
    resource_id: required(string()),
    plan_id: required(string()),
    resource_instance_id: required(string()),
    measured_usage: required(arrayOf(measure()))
  })
));

const isValidStopEvent = validator(json(
  objectType('stopEvent', {
    id: string(),
    timestamp: required(time()),
    organization_id: required(string()),
    space_id: required(string()),
    consumer_id: required(string()),
    resource_id: required(string()),
    plan_id: required(string()),
    resource_instance_id: required(string())
  })
));

class EventSchemaValidator {

  validateStartEvent(event) {
    if (!isValidStartEvent(event))
      throw new InvalidEventError();
  }

  validateStopEvent(event) {
    if (!isValidStopEvent(event))
      throw new InvalidEventError();
  }

}

module.exports = {
  EventSchemaValidator,
  InvalidEventError
};
