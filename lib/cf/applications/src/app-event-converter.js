'use strict';

const moment = require('abacus-moment');
const states = require('./app-event-states');

const isPurgeEvent = (event) => {
  const entity = event.entity;
  const instanceCountMatches = entity.previous_instance_count
    === entity.instance_count;
  const memoryPerInstanceMatches = entity.previous_memory_in_mb_per_instance
    === entity.memory_in_mb_per_instance;
  return instanceCountMatches && memoryPerInstanceMatches;
};

const createDefaultMeasures = (event) => {
  return {
    previousRunningInstances: event.entity.previous_instance_count,
    previousInstanceMemory:
      event.entity.previous_memory_in_mb_per_instance * 1048576,
    currentRunningInstances: event.entity.instance_count,
    currentInstanceMemory:
      event.entity.memory_in_mb_per_instance * 1048576
  };
};

const createStartEventMeasures = (event) => {
  const measures = createDefaultMeasures(event);
  const wasStopped = event.entity.previous_state === states.STOPPED;
  if (wasStopped || isPurgeEvent(event)) {
    measures.previousInstanceMemory = 0;
    measures.previousRunningInstances = 0;
  }
  return measures;
};

const createStopEventMeasures = (event) => {
  const measures = createDefaultMeasures(event);
  measures.currentInstanceMemory = 0;
  measures.currentRunningInstances = 0;
  return measures;
};

const createUsage = (event, measures) => {
  const eventTime = moment.utc(event.metadata.created_at).valueOf();
  return {
    start: eventTime,
    end: eventTime,
    organization_id: event.entity.org_guid,
    space_id: event.entity.space_guid,
    consumer_id: 'app:' + event.entity.app_guid,
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:' + event.entity.app_guid,
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: measures.currentInstanceMemory
      },
      {
        measure: 'current_running_instances',
        quantity: measures.currentRunningInstances
      },
      {
        measure: 'previous_instance_memory',
        quantity: measures.previousInstanceMemory
      },
      {
        measure: 'previous_running_instances',
        quantity: measures.previousRunningInstances
      }
    ]
  };
};

const convert = (event) => {
  const eventState = event.entity.state;
  switch (eventState) {
    case states.STARTED: {
      const measures = createStartEventMeasures(event);
      return createUsage(event, measures);
    }
    case states.STOPPED: {
      const measures = createStopEventMeasures(event);
      return createUsage(event, measures);
    }
    default:
      return undefined;
  }
};

module.exports = convert;
