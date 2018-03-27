'use strict';

const yieldable = require('abacus-yieldable');
const states = require('../service-event-states');

const createEventMapper = require('../service-event-mapper');

describe('service event mapper tests', () => {
  let event;
  let mapper;
  let sandbox;
  let mappedEvents;
  let precedingUsagesReaderFake;

  const orgGuid = 'org-guid';
  const spaceGuid = 'space-guid';
  const defaultPlanName = 'default-plan-name';
  const serviceInstanceGuid = 'service-instance-guid';
  const serviceInstanceLabel = 'service-instance-label';

  const usageEvent = (state) => {
    const defaultEvent = {
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
    };

    const overwritable = {
      overwriteEntity: (property, value) => {
        defaultEvent.entity[property] = value;
        return overwritable;
      },
      overwriteMetadata: (property, value) => {
        defaultEvent.metadata[property] = value;
        return overwritable;
      },
      get: () => defaultEvent
    };

    return overwritable;
  };

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    precedingUsagesReaderFake = {
      getPrecedingCreatedUsagePlanName: sandbox.stub()
    };
    mapper = createEventMapper(precedingUsagesReaderFake);
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when supported event is provided', () => {
    context('CREATED event', () => {
      beforeEach(yieldable.functioncb(function*() {
        event = usageEvent(states.CREATED).get();
        mappedEvents = yield mapper.toMultipleEvents(event);
      }));
      
      it('should map to array of single CREATED event', () => {
        expect(mappedEvents).to.deep.equal([event]);
      });
    });
  
    context('DELETED event', () => {
      beforeEach(yieldable.functioncb(function*() {
        event = usageEvent(states.DELETED).get();
        mappedEvents = yield mapper.toMultipleEvents(event);
      }));
      
      it('should map to array of single DELETED event', () => {
        expect(mappedEvents).to.deep.equal([event]);
      });
    });

    context('UPDATED event', () => {
      let expectedEvents;

      const getCalledWithParameter = (event) => ({
        serviceInstanceGuid: event.entity.service_instance_guid,
        orgGuid: event.entity.org_guid,
        spaceGuid: event.entity.space_guid
      });

      beforeEach(() => {
        event = usageEvent(states.UPDATED).get();
      });

      context('when precedin usage event plan name is not found', () => {
        beforeEach(yieldable.functioncb(function*() {
          precedingUsagesReaderFake.getPrecedingCreatedUsagePlanName.callsFake(function*() { 
            return undefined; 
          });
          mappedEvents = yield mapper.toMultipleEvents(event);
        }));
        
        it('should return expected business error', () => {
          const expectedError = { businessError: 'No preceding usage event found!'};
          expect(mappedEvents).to.deep.equal(expectedError);
          assert.calledWith(precedingUsagesReaderFake.getPrecedingCreatedUsagePlanName, getCalledWithParameter(event));
        });
      });

      context('when preceding usage event plan name is found', () => {
        const precedingPlanName = 'precedingPlanName';

        beforeEach(yieldable.functioncb(function*() {
          precedingUsagesReaderFake.getPrecedingCreatedUsagePlanName.callsFake(function*() { 
            return precedingPlanName; 
          });
          mappedEvents = yield mapper.toMultipleEvents(event);
        }));

        it('should map to array of two valid events', () => {
          const expectedDeletedEvent = usageEvent(states.DELETED)
            .overwriteEntity('service_plan_name', precedingPlanName)
            .get();
          const expectedCreatedEvent = usageEvent(states.CREATED)
            .overwriteMetadata('created_at', event.metadata.created_at + 1)
            .get();
          expectedEvents = [expectedDeletedEvent, expectedCreatedEvent];
          expect(mappedEvents).to.deep.equal(expectedEvents);
          assert.calledWith(precedingUsagesReaderFake.getPrecedingCreatedUsagePlanName, getCalledWithParameter(event));
        });
      });
    });
  });

  context('when unsupported event is provided', () => {

    beforeEach(yieldable.functioncb(function*() {
      event = usageEvent('unsupported').get();
      mappedEvents = yield mapper.toMultipleEvents(event);
    }));

    it('should return expected business error', () => {
      const expectedError = { businessError: `Event has invalid state: ${event.entity.state}`};
      expect(mappedEvents).to.deep.equal(expectedError);
    });
  });
});
