'use strict'

const yieldable = require('abacus-yieldable');
const states = require('../service-event-states');

const createEventMapper = require('../service-event-mapper');

describe('service event mapper', () => {
  let mapper;
  let sandbox;

  const orgGuid = 'org-guid';
  const spaceGuid = 'space-guid';
  const defaultPlanName = 'default-plan-name';
  const serviceInstanceGuid = 'service-instance-guid';
  const serviceInstanceLabel = 'service-instance-label';

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

  beforeEach(() => {
    sandbox = sinon.sandbox.create()
    mapper = createEventMapper();
  });

  context('when supported event is provided', () => {
    context('CREATED event', () => {
      let mappedEvents;
      let expectedEvent;
  
      beforeEach(yieldable.functioncb(function*() {
        expectedEvent = createEvent(states.CREATED);
        mappedEvents = yield mapper.toMultipleEvents(expectedEvent);
      }));
      
      it('should map to array of single CREATED event', () => {
        console.log(mappedEvents);
        expect(mappedEvents).to.deep.equal([expectedEvent]);
      });
    });
  
    context('DELETED event', () => {
      let mappedEvents;
      let expectedEvent;
  
      beforeEach(yieldable.functioncb(function*() {
        expectedEvent = createEvent(states.DELETED);
        mappedEvents = yield mapper.toMultipleEvents(expectedEvent);
      }));
      
      it('should map to array of single CREATED event', () => {
        console.log(mappedEvents);
        expect(mappedEvents).to.deep.equal([expectedEvent]);
      });
    });

    context('UPDATED event', () => {
      let mappedEvents;
      let expectedEvents;
  
      beforeEach(yieldable.functioncb(function*() {
        expectedEvents = [createEvent(states.DELETED),createEvent(states.CREATED)];
        mappedEvents = yield mapper.toMultipleEvents(expectedEvent);
      }));
      
      it('should map to array of two events - DELETED and CREATED', () => {
        console.log(mappedEvents);
        expect(mappedEvents).to.deep.equal(expectedEvents);
      });
    });
  });

  context('when unsupported event is provided', () => {

    beforeEach(yieldable.functioncb(function*() {
      expectedEvents = [createEvent(states.DELETED),createEvent(states.CREATED)];
      mappedEvents = yield mapper.toMultipleEvents(expectedEvent);
    }));

    it('should return undefined', () => {
      expect(mappedEvents).to.be.equal(undefined);
    });
  });


});
