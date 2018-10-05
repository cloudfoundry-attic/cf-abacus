'use strict';

const { objectType, string, arrayOf, anyType, time, required, json } = require('abacus-schema');
const validator = require('is-my-json-valid');

class InvalidEventError extends Error {
  constructor() {
    super('invalid event');
    Error.captureStackTrace(this, InvalidEventError);
  }
};

class EventValidator {

  constructor() {

    const measure = () =>
      objectType('measure', {
        measure: required(string()),
        quantity: required(anyType('quantity'))
      });

    this._isValidStartEvent = validator(json(
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

    this._isValidStopEvent = validator(json(
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

  }

  validateStartEvent(event) {
    if (!this._isValidStartEvent(event)) 
      throw new InvalidEventError();
  }

  validateStopEvent(event) {  
    if (!this._isValidStopEvent(event))
      throw new InvalidEventError();
  }

}

module.exports = {
  EventValidator,
  InvalidEventError
};
