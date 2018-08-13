'use strict';

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const states = require('../service-event-states');
const createEventMapper = require('../service-event-mapper');

describe('service event mapper tests', () => {
  let event;
  let mapper;
  let sandbox;
  let mappedEvents;
  let expectedEvents;
  let precedingUsagesReaderFake;

  const eventTimeString = '2017-12-27T12:13:14Z';
  const eventTimeStamp = moment.utc(eventTimeString).valueOf();
  const adjustedEventTimeStamp = moment.utc(eventTimeString).add(1, 'millisecond').valueOf();
  
  const usageEvent = () => {
    const defaultValue = 'default-value';

    let planName = defaultValue;
    let eventState = defaultValue;
    let createdAt = eventTimeString;

    const overwritable = {
      state: (val) => {
        eventState = val;
        return overwritable;
      },
      createdAt: (val) => {
        createdAt = val;
        return overwritable;
      },
      planName: (val) => {
        planName = val;
        return overwritable;
      },
      get: () => ({
        metadata: {
          created_at: createdAt,
          guid: defaultValue
        },
        entity: {
          org_guid: defaultValue,
          state: eventState,
          space_guid: defaultValue,
          service_plan_name: planName,
          service_label: defaultValue,
          service_instance_guid: defaultValue
        }
      })
    };

    return overwritable;
  };

  beforeEach(() => {
    expectedEvents = [];
    sandbox = sinon.createSandbox();
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
        event = usageEvent()
          .state(states.CREATED)
          .createdAt(eventTimeString)
          .get();
        mappedEvents = yield mapper.toMultipleEvents(event);
      }));
      
      it('should map to array of single CREATED event', () => {
        expectedEvents.push(usageEvent()
          .state(states.CREATED)
          .createdAt(eventTimeStamp)
          .get());
        expect(mappedEvents).to.deep.equal(expectedEvents);
      });
    });
  
    context('DELETED event', () => {
      beforeEach(yieldable.functioncb(function*() {
        event = usageEvent()
          .state(states.DELETED)
          .createdAt(eventTimeString)
          .get();
        mappedEvents = yield mapper.toMultipleEvents(event);
      }));
      
      it('should map to array of single DELETED event', () => {
        expectedEvents.push(usageEvent()
          .state(states.DELETED)
          .createdAt(eventTimeStamp)
          .get());
        expect(mappedEvents).to.deep.equal(expectedEvents);
      });
    });

    context('UPDATED event', () => {
      const getCalledWithParameter = (event) => ({
        serviceInstanceGuid: event.entity.service_instance_guid,
        orgGuid: event.entity.org_guid,
        spaceGuid: event.entity.space_guid
      });

      beforeEach(() => {
        event = usageEvent()
          .state(states.UPDATED)
          .get();
      });

      context('when precedin usage event plan name is not found', () => {
        beforeEach(yieldable.functioncb(function*() {
          precedingUsagesReaderFake.getPrecedingCreatedUsagePlanName.callsFake(function*() { 
            return undefined; 
          });
          mappedEvents = yield mapper.toMultipleEvents(event);
        }));
        
        it('should return expected business error', () => {
          expectedEvents = { businessError: 'No preceding usage event found!'};
          expect(mappedEvents).to.deep.equal(expectedEvents);
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
          expectedEvents.push(usageEvent()
            .state(states.DELETED)
            .planName(precedingPlanName)
            .createdAt(eventTimeStamp)
            .get()
          );
          expectedEvents.push(usageEvent()
            .state(states.CREATED)
            .createdAt(adjustedEventTimeStamp)
            .get()
          );  

          expect(mappedEvents).to.deep.equal(expectedEvents);
          assert.calledWith(precedingUsagesReaderFake.getPrecedingCreatedUsagePlanName, getCalledWithParameter(event));
        });
      });
    });
  });

  context('when unsupported event is provided', () => {

    beforeEach(yieldable.functioncb(function*() {
      event = usageEvent()
        .state('UNSUPPORTED')
        .get();
      mappedEvents = yield mapper.toMultipleEvents(event);
    }));

    it('should return expected business error', () => {
      expectedEvents = { businessError: `Event has invalid state: ${event.entity.state}`};
      expect(mappedEvents).to.deep.equal(expectedEvents);
    });
  });
});
