'use strict';


const { pageIterator, itemIterator } = require('abacus-paging');
const { yieldable } = require('abacus-yieldable');
const createWait = require('abacus-wait');

// Cloud Foundry guarantees that events will be available within a minute
// after the event occurs
const oneMinuteInMillis = 60 * 1000;
const waitUntil = yieldable(createWait(oneMinuteInMillis).until);

module.exports = (apiUrl, endpoint, orgGuid, token) => {

  const createEventFinder = (url, orgGuid, token) => {
    const findByStates = function*(states) {
      let nextEvent;
      const events = [];

      const iterator = yieldable(itemIterator(pageIterator(url, token)));
      while (nextEvent = yield iterator.next()) {
        const entity = nextEvent.entity;
        if (entity.org_guid !== orgGuid)
          continue;

        if (states.includes(entity.state))
          events.push(nextEvent);
      }
      return events;
    };

    return {
      byStates: findByStates
    };
  };

  const read = ({ afterGuid }) => {
    const waitForStates = function*(states) {
      const url = `${apiUrl}/v2/${endpoint}?order-direction=asc&results-per-page=1&after_guid=${afterGuid}`;
      const eventFinder = createEventFinder(url, orgGuid, token);

      let events;
      const eventsAreAvailable = function*() {
        events = yield eventFinder.byStates(states);
        return events.length == states.length;
      };

      try {
        yield waitUntil(eventsAreAvailable);
        return events;
      } catch (err) {
        throw new Error(`Could not find events with states ${states} after guid ${afterGuid}`);
      }
    };

    return {
      waitForStates
    };

  };

  const readLastEvent = function*() {
    const url = `${apiUrl}/v2/${endpoint}?order-direction=desc&results-per-page=1`;
    const iterator = yieldable(itemIterator(pageIterator(url, token)));
    return yield iterator.next();
  };

  return {
    read,
    readLastEvent
  };

};
