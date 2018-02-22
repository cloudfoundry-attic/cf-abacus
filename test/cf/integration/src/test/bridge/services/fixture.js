'use sterict';

const lifecycleManager = require('abacus-lifecycle-manager')();

const createAbacusCollectorMock = require('../../utils/server-mocks/abacus-collector-mock');
const createCloudControllerMock = require('../../utils/server-mocks/services-cloud-controller-mock');
const createUAAServerMock = require('../../utils/server-mocks/uaa-server-mock');
const externalSystemsMocks = require('../../utils/external-systems')({
  abacusCollector: createAbacusCollectorMock,
  cloudController: createCloudControllerMock,
  uaaServer: createUAAServerMock
});
const createEventTimestampGenerator = require('../event-timestamp-generator');
const createBridge = require('../bridge');

const oauth = {
  abacusCollectorScopes: ['abacus.usage.write', 'abacus.usage.read'],
  cfAdminScopes: [],
  abacusCollectorToken: 'abacus-collector-token',
  cfAdminToken: 'cfadmin-token'
};

const defaultUsageEvent = {
  state: 'CREATED',
  serviceGuid: 'test-service-guid',
  serviceLabel: 'test-service',
  eventGuid: 'event-guid',
  orgGuid: 'test-org',
  spaceGuid: 'space-guid',
  servicePlanName: 'test-plan',
  serviceInstanceGuid: 'service-instance-guid'
};

const bridge = createBridge({
  bridge: lifecycleManager.modules.services,
  port: 9502,
  customEnv: {
    SERVICES: `{
      "${defaultUsageEvent.serviceLabel}":{"plans":["${defaultUsageEvent.servicePlanName}"]}
    }`,
    ORGS_TO_REPORT: `["${defaultUsageEvent.orgGuid}"]`
  }
});

const eventTimestampGenerator = createEventTimestampGenerator(bridge.env.minimalAgeInMinutes + 1);
const validUsageEvent = () => {
  const createdAt = eventTimestampGenerator.next().value;
  return {
    metadata: {
      created_at: createdAt,
      guid: defaultUsageEvent.eventGuid + '-' + createdAt
    },
    entity: {
      state: defaultUsageEvent.state,
      org_guid: defaultUsageEvent.orgGuid,
      space_guid: defaultUsageEvent.spaceGuid,
      service_label: defaultUsageEvent.serviceLabel,
      service_plan_name: defaultUsageEvent.servicePlanName,
      service_instance_guid: defaultUsageEvent.serviceInstanceGuid
    }
  };
};

const usageEventStates = {
  default: 'CREATED',
  deleted: 'DELETED',
  updated: 'UPDATED'
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

collectorUsage = (eventTimestamp, state) => ({
  start: eventTimestamp,
  end: eventTimestamp,
  organization_id: defaultUsageEvent.orgGuid,
  space_id: defaultUsageEvent.spaceGuid,
  consumer_id: `service:${defaultUsageEvent.serviceInstanceGuid}`,
  resource_id: defaultUsageEvent.serviceLabel,
  plan_id: defaultUsageEvent.servicePlanName,
  resource_instance_id: `service:${defaultUsageEvent.serviceInstanceGuid}:${defaultUsageEvent.servicePlanName}:${
    defaultUsageEvent.serviceLabel
  }`,
  measured_usage: [
    {
      measure: 'current_instances',
      quantity: state === 'CREATED' ? 1 : 0
    },
    {
      measure: 'previous_instances',
      quantity: state === 'CREATED' ? 0 : 1
    }
  ]
});

module.exports = {
  oauth,
  bridge,
  usageEvent,
  collectorUsage,
  env: bridge.env,
  usageEventStates,
  defaultUsageEvent,
  externalSystemsMocks
};
