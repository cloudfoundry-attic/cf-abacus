'use strict';

const validator = require('is-my-json-valid');

class InvalidEventError extends Error {
  constructor() {
    super('invalid event');
    Error.captureStackTrace(this, InvalidEventError);
  }
};

class EventValidator {

  constructor() {
    this._validateStartEvent = validator({
      required: true,
      type: 'object',
      additionalProperties: false,
      properties: {
        id: {
          required: false
        },
        timestamp: {
          required: true,
          type: 'number'
        },
        organization_id: {
          required: true,
          type: 'string'
        },
        space_id: {
          required: true,
          type: 'string'
        },
        consumer_id: {
          required: true,
          type: 'string'
        },
        resource_id: {
          required: true,
          type: 'string'
        },
        plan_id: {
          required: true,
          type: 'string'
        },
        resource_instance_id: {
          required: true,
          type: 'string'
        },
        measured_usage: {
          required: true,
          type: 'array',
          additionalItems: false,
          minItems: 0,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              measure: {
                required: true,
                type: 'string'
              },
              quantity: {
                required: true
              }
            }
          }
        }
      }
    });
  }

  validateStartEvent(event) {
    if (!this._validateStartEvent(event)) 
      throw new InvalidEventError();
  }

  validateStopEvent(event) {

  }

  // validateEvent(event, schema) {

  // }

  // _validate(event, schema) {

  // }
}

module.exports = {
  EventValidator,
  InvalidEventError
};
