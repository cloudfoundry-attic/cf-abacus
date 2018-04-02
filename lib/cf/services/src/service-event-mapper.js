'use strict';

const moment = require('abacus-moment');
const { extend } = require('underscore');
const states = require('./service-event-states');

const debug = require('abacus-debug')('abacus-cf-services-event-mapper');

const eventMapper = (preceedingUsagesReader) => {

  const createCreateUsageEvent = (event) => {
    const createEvent = {
      metadata: extend({}, event.metadata, 
        { created_at: moment.utc(event.metadata.created_at).add(1, 'millisecond').valueOf() }),      
      entity: extend({}, event.entity, { state: states.CREATED })
    };
    debug(`Created ${createEvent.entity.state} event: %o`, createEvent);
    return createEvent;
  };

  const createDeleteUsageEvent = (event, precedingCreatedUsagePlanName) => {
    const deleteEvent = {
      metadata: extend({}, event.metadata, { created_at: moment.utc(event.metadata.created_at).valueOf() }),
      entity: extend({}, event.entity, { state: states.DELETED, service_plan_name: precedingCreatedUsagePlanName })
    };
    debug(`Created ${deleteEvent.entity.state} event: %o`, deleteEvent);
    return deleteEvent;
  };

  const selfMapper = {
    map: function*(event) {
      const mappedEvent = {
        metadata: extend({}, event.metadata, { created_at: moment.utc(event.metadata.created_at).valueOf() }),
        entity: event.entity
      };
      debug(`Created ${mappedEvent.entity.state} event: %o`);
      return [mappedEvent];
    }
  };

  const updateEventMapper = {
    map: function*(event) {
      const precedingCreatedUsagePlanName = yield preceedingUsagesReader.getPrecedingCreatedUsagePlanName({
        serviceInstanceGuid: event.entity.service_instance_guid,
        orgGuid: event.entity.org_guid,
        spaceGuid: event.entity.space_guid
      });
      if(!precedingCreatedUsagePlanName)
        return { businessError: 'No preceding usage event found!'};

      return [
        createDeleteUsageEvent(event, precedingCreatedUsagePlanName), 
        createCreateUsageEvent(event)
      ];
    }
  };

  const mappers = {
    [states.CREATED]: selfMapper,
    [states.DELETED]: selfMapper,
    [states.UPDATED]: updateEventMapper
  };

  const toMultipleEvents = function*(event) {
    return mappers[event.entity.state] ? 
      yield mappers[event.entity.state].map(event) : 
      { businessError: `Event has invalid state: ${event.entity.state}`};
  };

  return {
    toMultipleEvents
  };
};

module.exports = eventMapper;
