'use sterict';

const npm = require('abacus-npm');

const createAbacusCollectorMock = require('./abacus-collector-mock');
const createCloudControllerMock = require('./application-usage-events');
const createUAAServerMock = require('./uaa-server-mock');
const getExternalSystemsMocks = require('./external-systems')(
  createAbacusCollectorMock,
  createCloudControllerMock,
  createUAAServerMock
);
const createEventTimestampGenerator = require('./event-timestamp-generator');
const createBridge = require('./bridge');

const defaults = {
  oauth: {
    abacusCollectorScopes: ['abacus.usage.linux-container.write', 'abacus.usage.linux-container.read'],
    cfAdminScopes: [],
    abacusCollectorToken: 'abacus-collector-token',
    cfAdminToken: 'cfadmin-token'
  },
  usageEvent: {
    state: 'STARTED',
    previousState: 'STOPPED',
    appGuid: 'test-app-guid',
    eventGuid: 'event-guid',
    orgGuid: 'test-org',
    spaceGuid:'space-guid',
    instanceCount: 5,
    previousInstanceCount: 3,
    memoryPerInstance: 2,
    previousMemoryPerInstance: 6
  }
};

const bridge = createBridge({
  bridge: npm.modules.applications,
  port: 9500,
  customEnv: {
    ORGS_TO_REPORT : `["${defaults.usageEvent.orgGuid}"]`
  }
});

const eventTimestampGenerator = createEventTimestampGenerator(bridge.defaultEnv.minimalAgeInMinutes + 1);
const validUsageEvent = () => {
  const createdAt = eventTimestampGenerator.next().value;
  return {
    metadata: {
      created_at: createdAt,
      guid: defaults.usageEvent.eventGuid + '-' + createdAt
    },
    entity: {
      state: defaults.usageEvent.state,
      previous_state: defaults.usageEvent.previousState,
      org_guid: defaults.usageEvent.orgGuid,
      space_guid: defaults.usageEvent.spaceGuid,
      app_guid: defaults.usageEvent.appGuid,
      instance_count: defaults.usageEvent.instanceCount,
      previous_instance_count: defaults.usageEvent.previousInstanceCount,
      memory_in_mb_per_instance: defaults.usageEvent.memoryPerInstance,
      previous_memory_in_mb_per_instance: defaults.usageEvent.previousMemoryPerInstance
    }
  };
};

const usageEvent = () => {
  const resultUsageEvent = validUsageEvent();

  const overwritable = {
    overwriteEventGuid: (value) => {
      resultUsageEvent.metadata.guid = value;
      return overwritable;
    },
    overwriteCreatedAt: (value) => {
      resultUsageEvent.metadata.created_at = value;
      return overwritable;
    },
    overwriteState: (value) => {
      resultUsageEvent.entity.state = value;
      return overwritable;
    },
    overwriteOrgGuid: (value) => {
      resultUsageEvent.entity.org_guid = value;
      return overwritable;
    },
    get: () => resultUsageEvent
  };

  return overwritable;
};

collectorUsage = (eventTimestamp) => ({
  start: eventTimestamp,
  end: eventTimestamp,
  organization_id: defaults.usageEvent.orgGuid,
  space_id: defaults.usageEvent.spaceGuid,
  consumer_id: `app:${defaults.usageEvent.appGuid}`,
  resource_id: 'linux-container',
  plan_id: 'standard',
  resource_instance_id: `memory:${defaults.usageEvent.appGuid}`,
  measured_usage: [
    {
      measure: 'current_instance_memory',
      quantity : 2097152
    },
    {
      measure: 'current_running_instances',
      quantity: 5
    },
    {
      measure: 'previous_instance_memory',
      quantity : 0
    },
    {
      measure: 'previous_running_instances',
      quantity : 0
    }
  ]
});

module.exports = {
  defaults,
  env: bridge.defaultEnv,
  usageEvent,
  collectorUsage,
  getExternalSystemsMocks,
  bridge
};
