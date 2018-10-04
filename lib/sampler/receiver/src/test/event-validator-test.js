'use strict';

const { omit } = require('underscore');
const { EventValidator, InvalidEventError } = require('../lib/event-validator');

describe('#validateStartEvent', () => {
  const validStartEvent = () => ({
    id: 'dedup-guid',
    timestamp: 123,
    organization_id: 'organization-guid',
    space_id: 'space-guid',
    consumer_id: 'consumer-guid',
    resource_id: 'resource-guid',
    plan_id: 'plan-guid',
    resource_instance_id: 'resource-instance-guid',
    measured_usage: [
      {
        measure: 'example',
        quantity: 10
      }
    ]
  });
  let eventValidator;

  beforeEach(() => {
    eventValidator = new EventValidator();
  });

  context('when start event is valid', () => {

    it('should not throw error if all properties are present', () => {
      eventValidator.validateStartEvent(validStartEvent());
    });

    it('should not throw if "measured_usage" is empty array', () => {
      const startEvent = validStartEvent();
      startEvent.measured_usage = [];
      eventValidator.validateStartEvent(startEvent);
    });

    it('should not throw if "id" is missing', () => {
      const startEvent = omit(validStartEvent(), 'id');
      eventValidator.validateStartEvent(startEvent);
    });
  });

  context('when start event is not valid', () => {

    it('should throw if "timestamp" is missing', () => {
      const startEvent = omit(validStartEvent(), 'timestamp');
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "timestamp" is not a number', () => {
      const startEvent = validStartEvent();
      startEvent.timestamp = 'not a number';
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "organization_id" is missing', () => {
      const startEvent = omit(validStartEvent(), 'organization_id');
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "space_id" is missing', () => {
      const startEvent = omit(validStartEvent(), 'space_id');
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "consumer_id" is missing', () => {
      const startEvent = omit(validStartEvent(), 'consumer_id');
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "resource_id" is missing', () => {
      const startEvent = omit(validStartEvent(), 'resource_id');
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "plan_id" is missing', () => {
      const startEvent = omit(validStartEvent(), 'plan_id');
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "resource_instance_id" is missing', () => {
      const startEvent = omit(validStartEvent(), 'resource_instance_id');
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "measured_usage" is missing', () => {
      const startEvent = omit(validStartEvent(), 'measured_usage');
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "measured_usage.measure" is missing', () => {
      const startEvent = validStartEvent();
      startEvent.measured_usage[0].measure = undefined;
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "measured_usage.quantity" is missing', () => {
      const startEvent = validStartEvent();
      startEvent.measured_usage[0].quantity = undefined;
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw if "measured_usage" contains additional property', () => {
      const startEvent = validStartEvent();
      startEvent.measured_usage[0].additional = 'value';
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

    it('should throw event contains additional property', () => {
      const startEvent = validStartEvent();
      startEvent.additional = 'value';
      expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidEventError);
    });

  });

});

describe('#validateEndEvent', () => {

});
