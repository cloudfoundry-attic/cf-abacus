'use strict';

const { extend } = require('underscore');
const states = require('./service-event-states');

const debug = require('abacus-debug')('abacus-cf-services-event-mapper');

const eventMapper = (preceedingUsagesReader) => {

  const createCreateUsageEvent = (event) => {
    const createEvent = {
      metadata: extend({}, event.metadata, { created_at: event.metadata.created_at + 1 }),
      entity: extend({}, event.entity, { state: states.CREATED })
    };

    return createEvent;
  };

  const createDeleteUsageEvent = (event, precedingCreatedUsagePlanName) => {
    const deleteEvent = {
      metadata: event.metadata,
      entity: extend({}, event.entity, { state: states.DELETED, service_plan_name: precedingCreatedUsagePlanName })
    };
    return deleteEvent;
  };

  const selfMapper = {
    map: function*(event) {
      return [event];
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
        return undefined;

      return [createDeleteUsageEvent(event, precedingCreatedUsagePlanName), createCreateUsageEvent(event)];
    }
  };

  const mappers = {
    [states.CREATED]: selfMapper,
    [states.DELETED]: selfMapper,
    [states.UPDATED]: updateEventMapper
  };

  const toMultipleEvents = function*(event) {
    debug(`Mapping event with state ${event.entity.state} to multiple events ...`);
    return mappers[event.entity.state] ? yield mappers[event.entity.state].map(event) : undefined;
  };

  return {
    toMultipleEvents
  };
};

module.exports = eventMapper;
