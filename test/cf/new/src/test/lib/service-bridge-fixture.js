'use sterict';

const npm = require('abacus-npm');

const createAbacusCollectorMock = require('./abacus-collector-mock');
const createCloudControllerMock = require('./services-usage-events');
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
    abacusCollectorScopes: ['abacus.usage.write', 'abacus.usage.read'],
    cfAdminScopes: [],
    abacusCollectorToken: 'abacus-collector-token',
    cfAdminToken: 'cfadmin-token'
  },
  usageEvent: {
    state: 'CREATED',
    serviceGuid: 'test-service-guid',
    serviceLabel: 'test-service',
    eventGuid: 'event-guid',
    orgGuid: 'test-org',
    spaceGuid:'space-guid',
    servicePlanName:'test-plan',
    serviceInstanceGuid: 'service-instance-guid'
  }
};

const bridge = createBridge({
  bridge: npm.modules.services,
  port: 9502,
  customEnv: {
    SERVICES: `{
      "${defaults.usageEvent.serviceLabel}":{"plans":["${defaults.usageEvent.servicePlanName}"]}
    }`,
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
      org_guid: defaults.usageEvent.orgGuid,
      space_guid: defaults.usageEvent.spaceGuid,
      service_label: defaults.usageEvent.serviceLabel,
      service_plan_name: defaults.usageEvent.servicePlanName,
      service_instance_guid: defaults.usageEvent.serviceInstanceGuid
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
    overwriteServiceLabel: (value) => {
      resultUsageEvent.entity.service_label = value;
      return overwritable;
    },
    overwriteServicePlanName: (value) => {
      resultUsageEvent.entity.service_plan_name = value;
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
  consumer_id: `service:${defaults.usageEvent.serviceInstanceGuid}`,
  resource_id: defaults.usageEvent.serviceLabel,
  plan_id: defaults.usageEvent.servicePlanName,
  resource_instance_id: `service:${defaults.usageEvent.serviceInstanceGuid}:${defaults.usageEvent.servicePlanName}:${defaults.usageEvent.serviceLabel}`,
  measured_usage: [
    {
      measure: 'current_instances',
      quantity : 1
    },
    {
      measure: 'previous_instances',
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
