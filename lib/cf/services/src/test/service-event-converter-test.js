'use strict';

const yieldable = require('abacus-yieldable');

const states = require('../service-event-states');

const createEventConverter = require('../service-event-converter');

describe('service event converter', () => {
  const orgGuid = 'org-guid';
  const fakeEvent = 'fake-event';
  const spaceGuid = 'space-guid';
  const defaultPlanName = 'default-plan-name';
  const serviceInstanceGuid = 'service-instance-guid';
  const serviceInstanceLabel = 'service-instance-label';

  let sandbox;
  let mapperStub;
  let eventConverter;

  const createEvent = (state) => ({
    metadata: {
      created_at: 1000,
      guid: 'event-guid'
    },
    entity: {
      state,
      org_guid: orgGuid,
      space_guid: spaceGuid,
      service_label: serviceInstanceLabel,
      service_plan_name: defaultPlanName,
      service_instance_guid: serviceInstanceGuid
    }
  });

  const createUsage = (currentInstances, previousInstances) => ({
    end: 1000,
    start: 1000,
    space_id: spaceGuid,
    organization_id: orgGuid,
    plan_id: defaultPlanName,
    resource_id: serviceInstanceLabel,
    consumer_id: `service:${serviceInstanceGuid}`,
    resource_instance_id: `service:${serviceInstanceGuid}:${defaultPlanName}:${serviceInstanceLabel}`,
    measured_usage: [
      {
        measure: 'current_instances',
        quantity: currentInstances
      },
      {
        measure: 'previous_instances',
        quantity: previousInstances
      }
    ]
  });

  beforeEach(() => {
    sandbox = sinon.sandbox.create()
    mapperStub = {
      toMultipleEvents: sandbox.stub()
    }
    eventConverter = createEventConverter(mapperStub);
  });

  const itMapperProperlyCalled = () => 
    it('should call mapper with correct argument', () => {
      assert.calledOnce(mapperStub.toMultipleEvents);
      assert.calledWithExactly(mapperStub.toMultipleEvents, fakeEvent);
    });

  context('when event is not mapped', () => {
    let usages;

    beforeEach(yieldable.functioncb(function*() {
      mapperStub.toMultipleEvents.callsFake(function*(fakeEvent) { return undefined; });
      usages = yield eventConverter.convertEvent(fakeEvent);
    }));
    
    it('should convert to correct usage', () => {            
      expect(usages).to.equal(undefined);
    });

    itMapperProperlyCalled();
  });

  context('when event is mapped to single event', () => {
    const singleEventContext = (givenState, expectedUsages) => 
      context(`when ${givenState} usage event is received`, () => {
        let event;
        let usages;
    
        beforeEach(yieldable.functioncb(function*() {
          event = createEvent(givenState);
          
          mapperStub.toMultipleEvents.returns([event]);
          usages = yield eventConverter.convertEvent(fakeEvent);
        }));
        
        it('should convert to correct usage', () => {        
          expect(usages).to.deep.equal(expectedUsages);
        });

        itMapperProperlyCalled();
      });

    singleEventContext(states.CREATED, [createUsage(1, 0)]);
    singleEventContext(states.DELETED, [createUsage(0, 1)]);
  });

  context('when event is mapped to unsupported event', () => {
    beforeEach(() => {
      mapperStub.toMultipleEvents.returns([createEvent('UNSUPPORTED')]);
    });
    
    it('should throw error', yieldable.functioncb(function*() { 
      let error;
      try {
        yield eventConverter.convertEvent(fakeEvent);
      } catch (err) {
        error = err;
      }

      expect(error.message).to.deep.equal(`Found unsupported event state. Event: ${[createEvent('UNSUPPORTED')]}`);
    }));
  });

  context('when event is mapped to multiple events', () => {
    let usages;

    beforeEach(yieldable.functioncb(function*() {
      mapperStub.toMultipleEvents.returns([
        createEvent(states.DELETED),
        createEvent(states.CREATED)]);
      usages = yield eventConverter.convertEvent(fakeEvent);
    }));
    
    it('should convert to correct usage', () => {        
      const expectedUsages = [createUsage(0, 1), createUsage(1, 0)];    
      expect(usages).to.deep.equal(expectedUsages);
    });

    itMapperProperlyCalled();
  });
});
