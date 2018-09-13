'use strict';

const { extend } = require('underscore');

const moment = require('abacus-moment');

const states = require('./service-event-states');

const debug = require('abacus-debug')('abacus-cf-services-event-mapper');

const convertTime = (timeString, adjustment) => moment.utc(timeString).add(adjustment || 0, 'millisecond').valueOf();

const overwriteEvent = (event) => {
  const newEntity = {};
  const newMetadata = {};
  const overwritable = {
    state: (newState) => {
      newEntity.state = newState;
      return overwritable;
    },
    time: (newTime) => {
      newMetadata.created_at = newTime;
      return overwritable;
    },
    planName: (newPlanName) => {
      newEntity.service_plan_name = newPlanName;
      return overwritable;
    },
    get: () => {
      const newEvent = {
        metadata: extend({}, event.metadata, newMetadata),
        entity: extend({}, event.entity, newEntity)
      };
      debug(`Created ${newEvent.entity.state} event: %o`, newEvent);
      return newEvent;
    }
  };
  return overwritable;
};

const selfMapper = {
  map: function*(event) {
    return [overwriteEvent(event).time(convertTime(event.metadata.created_at)).get()];
  }
};

const updateEventMapper = (getPrecedingPlanName) => ({
  map: function*(event) {
    const precedingPlanName = yield getPrecedingPlanName({
      serviceInstanceGuid: event.entity.service_instance_guid,
      orgGuid: event.entity.org_guid,
      spaceGuid: event.entity.space_guid
    });

    if(!precedingPlanName)
      return { businessError: 'No preceding usage event found!' };

    const eventTime = event.metadata.created_at;
    return [
      overwriteEvent(event).state(states.DELETED).time(convertTime(eventTime)).planName(precedingPlanName).get(),
      overwriteEvent(event).state(states.CREATED).time(convertTime(eventTime, 1)).get()
    ];
  }
});

const eventMapper = (getPrecedingPlanName) => {
  const mappers = {
    [states.CREATED]: selfMapper,
    [states.DELETED]: selfMapper,
    [states.UPDATED]: updateEventMapper(getPrecedingPlanName)
  };

  const toMultipleEvents = function*(event) {
    return mappers[event.entity.state] ? 
      yield mappers[event.entity.state].map(event) : 
      { businessError: `Event has invalid state: ${event.entity.state}` };
  };

  return {
    toMultipleEvents
  };
};

module.exports = eventMapper;
