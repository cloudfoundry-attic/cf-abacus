'use strict';

const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-cf-services-service-event-converter');

const createUsage = (event) => {
  const eventTime = event.metadata.created_at;
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
    space_id: event.entity.space_guid,
    organization_id: event.entity.org_guid,
    resource_instance_id: `${serviceGUID}:${planName}:${serviceLabel}`
  };

  if (event.entity.state == 'CREATED')
    return extend({}, usage, measuredUsage(1, 0));

  return extend({}, usage, measuredUsage(0, 1));
};

const convert = (event) => {
  const usage = createUsage(event);
  debug('Converted event %o to usage %o.', event, usage);
  return usage;
};

module.exports = convert;
