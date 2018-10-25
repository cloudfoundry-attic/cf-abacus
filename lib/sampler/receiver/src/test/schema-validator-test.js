'use strict';

const { omit } = require('underscore');
const { SchemaValidator, InvalidSchemaError } = require('../lib/schema-validator');


describe('SchemaValidator', () => {
  let eventValidator;

  beforeEach(() => {
    eventValidator = new SchemaValidator();
  });

  const itNoId = (createValidEventFn, validateFn) =>
    it('should not throw if "id" is missing', () => {
      const event = omit(createValidEventFn(), 'id');
      validateFn(event);
    });

  const itNoTimestamp = (createValidEventFn, validateFn) =>
    it('should throw if "timestamp" is missing', () => {
      const event = omit(createValidEventFn(), 'timestamp');
      expect(() => validateFn(event)).to.throw(InvalidSchemaError);
    });

  const itNoOrganizationId = (createValidEventFn, validateFn) =>
    it('should throw if "organization_id" is missing', () => {
      const event = omit(createValidEventFn(), 'organization_id');
      expect(() => validateFn(event)).to.throw(InvalidSchemaError);
    });

  const itNoSpaceId = (createValidEventFn, validateFn) => 
    it('should throw if "space_id" is missing', () => {
      const event = omit(createValidEventFn(), 'space_id');
      expect(() => validateFn(event)).to.throw(InvalidSchemaError);
    });

  const itNoConsumerId = (createValidEventFn, validateFn) =>   
    it('should throw if "consumer_id" is missing', () => {
      const event = omit(createValidEventFn(), 'consumer_id');
      expect(() => validateFn(event)).to.throw(InvalidSchemaError);
    });

  const itNoResourceId = (createValidEventFn, validateFn) =>   
    it('should throw if "resource_id" is missing', () => {
      const event = omit(createValidEventFn(), 'resource_id');
      expect(() => validateFn(event)).to.throw(InvalidSchemaError);
    });

  const itNoPlanId = (createValidEventFn, validateFn) =>   
    it('should throw if "plan_id" is missing', () => {
      const event = omit(createValidEventFn(), 'plan_id');
      expect(() => validateFn(event)).to.throw(InvalidSchemaError);
    });

  const itNoResourceInstanceId = (createValidEventFn, validateFn) =>   
    it('should throw if "resource_instance_id" is missing', () => {
      const event = omit(createValidEventFn, 'resource_instance_id');
      expect(() => validateFn(event)).to.throw(InvalidSchemaError);
    });


  const itNoAdditionalProperties = (createValidEventFn, validateFn) =>  
    it('should throw event contains additional property', () => {
      const event = createValidEventFn();
      event.additional = 'value';
      expect(() => validateFn(event)).to.throw(InvalidSchemaError);
    });

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

    context('when start event is valid', () => {

      it('should not throw error if all properties are present', () => {
        eventValidator.validateStartEvent(validStartEvent());
      });

      it('should not throw if "measured_usage" is empty array', () => {
        const startEvent = validStartEvent();
        startEvent.measured_usage = [];
        eventValidator.validateStartEvent(startEvent);
      });

      itNoId(validStartEvent, (event) => eventValidator.validateStartEvent(event));

    });

    context('when start event is not valid', () => {

      itNoTimestamp(validStartEvent, (event) => eventValidator.validateStartEvent(event));
      itNoOrganizationId(validStartEvent, (event) => eventValidator.validateStartEvent(event));
      itNoSpaceId(validStartEvent, (event) => eventValidator.validateStartEvent(event));
      itNoConsumerId(validStartEvent, (event) => eventValidator.validateStartEvent(event));
      itNoResourceId(validStartEvent, (event) => eventValidator.validateStartEvent(event));
      itNoPlanId(validStartEvent, (event) => eventValidator.validateStartEvent(event));
      itNoResourceInstanceId(validStartEvent, (event) => eventValidator.validateStartEvent(event));
      itNoAdditionalProperties(validStartEvent, (event) => eventValidator.validateStartEvent(event));

      it('should throw if "measured_usage" is missing', () => {
        const startEvent = omit(validStartEvent(), 'measured_usage');
        expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidSchemaError);
      });

      it('should throw if "measured_usage.measure" is missing', () => {
        const startEvent = validStartEvent();
        startEvent.measured_usage[0].measure = undefined;
        expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidSchemaError);
      });

      it('should throw if "measured_usage.quantity" is missing', () => {
        const startEvent = validStartEvent();
        startEvent.measured_usage[0].quantity = undefined;
        expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidSchemaError);
      });

      it('should throw if "measured_usage" contains additional property', () => {
        const startEvent = validStartEvent();
        startEvent.measured_usage[0].additional = 'value';
        expect(() => eventValidator.validateStartEvent(startEvent)).to.throw(InvalidSchemaError);
      });

    });

  });

  describe('#validateStopEvent', () => {
    const validStopEvent = () => ({
      id: 'dedup-guid',
      timestamp: 123,
      organization_id: 'organization-guid',
      space_id: 'space-guid',
      consumer_id: 'consumer-guid',
      resource_id: 'resource-guid',
      plan_id: 'plan-guid',
      resource_instance_id: 'resource-instance-guid'
    });

    context('when stop event is valid', () => {

      it('should not throw error if all properties are present', () => {
        eventValidator.validateStopEvent(validStopEvent());
      });

      itNoId(validStopEvent, (event) => eventValidator.validateStopEvent(event));
    });

    context('when stop event is not valid', () => {

      itNoTimestamp(validStopEvent, (event) => eventValidator.validateStopEvent(event));
      itNoOrganizationId(validStopEvent, (event) => eventValidator.validateStopEvent(event));
      itNoSpaceId(validStopEvent, (event) => eventValidator.validateStopEvent(event));
      itNoConsumerId(validStopEvent, (event) => eventValidator.validateStopEvent(event));
      itNoResourceId(validStopEvent, (event) => eventValidator.validateStopEvent(event));
      itNoPlanId(validStopEvent, (event) => eventValidator.validateStopEvent(event));
      itNoResourceInstanceId(validStopEvent, (event) => eventValidator.validateStopEvent(event));
      itNoAdditionalProperties(validStopEvent, (event) => eventValidator.validateStopEvent(event));

      it('should throw if "measured_usage" is present', () => {
        const stopEvent = validStopEvent();
        stopEvent.measured_usage = {
          measure: 'name',
          quantity: 1
        };

        expect(() => eventValidator.validateStopEvent(stopEvent)).to.throw(InvalidSchemaError);
      });

    });

  });

  describe('#validateMappings', () => {
    const validMappings = () => ({
      resource_id: 'resource-guid',
      plan_id: 'plan-guid',
      metering_plan: 'metering-plan',
      rating_plan: 'rating-plan',
      pricing_plan: 'pricing-plan'
    });

    context('when mappings are valid', () => {

      it('should not throw error', () => {
        eventValidator.validateMappings(validMappings());
      });

    });

    context('when mappings are not valid', () => {

      it('should throw if "resource_id" is missing', () => {
        const event = omit(validMappings(), 'resource_id');
        expect(() => eventValidator.validateMappings(event)).to.throw(InvalidSchemaError);
      });

      it('should throw if "plan_id" is missing', () => {
        const event = omit(validMappings(), 'plan_id');
        expect(() => eventValidator.validateMappings(event)).to.throw(InvalidSchemaError);
      });

      it('should throw if "metering_plan" is missing', () => {
        const event = omit(validMappings(), 'metering_plan');
        expect(() => eventValidator.validateMappings(event)).to.throw(InvalidSchemaError);
      });

      it('should throw if "rating_plan" is missing', () => {
        const event = omit(validMappings(), 'rating_plan');
        expect(() => eventValidator.validateMappings(event)).to.throw(InvalidSchemaError);
      });

      it('should throw if "pricing_plan" is missing', () => {
        const event = omit(validMappings(), 'pricing_plan');
        expect(() => eventValidator.validateMappings(event)).to.throw(InvalidSchemaError);
      });

    });
  });

});
