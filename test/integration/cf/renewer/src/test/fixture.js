'use strict';

const renewer = require('./renewer')();

const {
  abacusCollectorMock,
  applicationsCloudControllerMock,
  uaaServerMock,
  externalSystems
} = require('abacus-mock-util');

const externalSystemsMocks = externalSystems({
  abacusCollector: abacusCollectorMock,
  cloudController: applicationsCloudControllerMock,
  uaaServer: uaaServerMock
});

const abacusCollectorScopes = ['abacus.usage.write', 'abacus.usage.read'];
const abacusCollectorToken = 'abacus-collector-token';

const createUsage = () => {
  let timestamp;
  let currentInstances;
  let previousInstances;
  let organizationId;

  const builder = {
    withTimestamp: (value) => {
      timestamp = value;
      return builder;
    },
    withCurrentInstances: (value) => {
      currentInstances = value;
      return builder;
    },
    withPreviousInstances: (value) => {
      previousInstances = value;
      return builder;
    },
    withOrganizationId: (value) => {
      organizationId = value;
      return builder;
    },
    build: () => ({
      start: timestamp,
      end: timestamp,
      organization_id: organizationId,
      space_id: 'space-id',
      consumer_id: 'consumer-id',
      resource_id: 'resource-id',
      plan_id: 'plan-id',
      resource_instance_id: 'resource-instance-id',
      measured_usage: [
        {
          measure: 'current_instances',
          quantity: currentInstances
        },
        {
          measure: 'previous_instances',
          quantity: previousInstances
        }
      ]
    })
  };

  return builder;
};

const modifyUsage = (usage) => {
  let timestamp;
  let previousInstances;

  const builder = {
    withTimestamp: (value) => {
      timestamp = value;
      return builder;
    },

    withPreviousInstances: (value) => {
      previousInstances = value;
      return builder;
    },

    build: () => {
      if (timestamp !== undefined) {
        usage.start = timestamp;
        usage.end = timestamp;
      }

      if (previousInstances !== undefined) usage.measured_usage[1].quantity = previousInstances;

      return usage;
    }
  };

  return builder;
};

module.exports = {
  abacusCollectorScopes,
  abacusCollectorToken,
  renewer,
  externalSystemsMocks,
  usage: {
    create: createUsage,
    modify: modifyUsage
  }
};
