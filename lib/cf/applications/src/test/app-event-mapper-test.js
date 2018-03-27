'use strict';

const yieldable = require('abacus-yieldable');
const createEventMapper = require('../app-event-mapper');

describe('app-event-converter', () => {
  let event;
  let mappedEvents;

  context('when mapping app usage events', () => {
    beforeEach(yieldable.functioncb(function*() {
      event = { entity: { state: 'STARTED' } };
      const mapper = createEventMapper();
      mappedEvents = yield mapper.toMultipleEvents(event);
    }));

    it('should map to array of single event', () => {
      expect(mappedEvents).to.deep.equal([event]);
    });
  });
});
