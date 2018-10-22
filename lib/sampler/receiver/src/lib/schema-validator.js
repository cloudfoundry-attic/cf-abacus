'use strict';

const { objectType, string, arrayOf, anyType, time, required, json } = require('abacus-schema');
const validator = require('is-my-json-valid');

class InvalidSchemaError extends Error {
  constructor() {
    super('invalid schema');
    Error.captureStackTrace(this, InvalidSchemaError);
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

const isValidMappings = validator(json(
  objectType('createMappings', {
    resource_id: required(string()),
    plan_id: required(string()),
    metering_plan: required(string()),
    rating_plan: required(string()),
    pricing_plan: required(string())
  })
));

class SchemaValidator {

  validateStartEvent(event) {
    if (!isValidStartEvent(event))
      throw new InvalidSchemaError();
  }

  validateStopEvent(event) {
    if (!isValidStopEvent(event))
      throw new InvalidSchemaError();
  }

  validateMappings(mappings) {
    if (!isValidMappings(mappings)) 
      throw new InvalidSchemaError();
  }

}

module.exports = {
  SchemaValidator,
  InvalidSchemaError
};
