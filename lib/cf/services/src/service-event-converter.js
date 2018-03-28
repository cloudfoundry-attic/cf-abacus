'use strict';

const moment = require('abacus-moment');
const states = require('./service-event-states');

const createUsage = (event) => {
  const eventTime = moment.utc(event.metadata.created_at).valueOf();
  const serviceGUID = `service:${event.entity.service_instance_guid}`;
  const serviceLabel = event.entity.service_label;
  const planName = event.entity.service_plan_name;
  return {
    start: eventTime,
    end: eventTime,
    organization_id: event.entity.org_guid,
    space_id: event.entity.space_guid,
    consumer_id: serviceGUID,
    resource_id: serviceLabel,
    plan_id: planName,
    resource_instance_id: `${serviceGUID}:${planName}:${serviceLabel}`,
    measured_usage: [
      {
        measure: 'current_instances',
        quantity: event.entity.state === states.CREATED ? 1 : 0
      },
      {
        measure: 'previous_instances',
        quantity: event.entity.state === states.CREATED ? 0 : 1
      }
    ]
  };
};

const isSupportedState = (state) => {
  return [states.CREATED, states.DELETED].includes(state);
};

const convert = (event) => {
  const eventState = event.entity.state;
  return isSupportedState(eventState) ? createUsage(event) : undefined;
};

module.exports = convert;
