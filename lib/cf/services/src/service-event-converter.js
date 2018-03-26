'use strict';

const { extend, map } = require('underscore');

const moment = require('abacus-moment');

const createUsage = (event) => {
  const eventTime = moment.utc(event.metadata.created_at).valueOf();
  const serviceGUID = `service:${event.entity.service_instance_guid}`;
  const serviceLabel = event.entity.service_label;
  const planName = event.entity.service_plan_name;

  const measuredUsage = (currentInstances, previousInstances) => ({
    measured_usage: [
      {
        measure: 'current_instances',
        quantity: currentInstances
      },
      {
        measure: 'previous_instances',
        quantity: previousInstances
      }]
  });

  const usage = {
    end: eventTime,
    start: eventTime,
    plan_id: planName,
    consumer_id: serviceGUID,
    resource_id: serviceLabel,
    eventState: event.entity.state,
    space_id: event.entity.space_guid,
    organization_id: event.entity.org_guid,
    resource_instance_id: `${serviceGUID}:${planName}:${serviceLabel}`
  };

  if (event.entity.state == 'CREATED')
    return extend({}, usage, measuredUsage(1, 0));

  if (event.entity.state == 'DELETED')
    return extend({}, usage, measuredUsage(0, 1));

  throw new Error(`Found unsupported event state. Event: ${event}`);
};

const eventConverter = (eventMapper) => {
  const convertEventToUsages = function*(event) {

    const events = yield eventMapper.toMultipleEvents(event);
    if (!events)
      return undefined;

    return map(events, (event) => createUsage(event));
  };

  return {
    convertEvent: convertEventToUsages
  };
};

module.exports = eventConverter;
