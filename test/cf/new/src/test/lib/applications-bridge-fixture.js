'use sterict';

const async = require('async');
const extend = require('underscore').extend;

const dbclient = require('abacus-dbclient');
const npm = require('abacus-npm');
const moment = require('abacus-moment');

const createAbacusCollectorMock = require('./abacus-collector-mock');
const createCloudControllerMock = require('./application-usage-events');
const createUAAServerMock = require('./uaa-server-mock');

const retryCount = 3;
const minimalAgeInMinutes = 3;
const minimalAgeInMinutesInMillis = minimalAgeInMinutes * 60 * 1000;

const defaults = {
  oauth: {
    tokenSecret: 'secret',
    tokenAlgorithm: 'HS256',
    cfClientId: 'cf-client-id',
    cfClientSecret: 'cf-client-secret',
    abacusClientId: 'abacus-collector-client-id',
    abacusClientSecret: 'abacus-collector-client-secret',
    abacusCollectorScopes: ['abacus.usage.linux-container.write', 'abacus.usage.linux-container.read'],
    cfAdminScopes: [],
    abacusCollectorToken: 'abacus-collector-token',
    cfAdminToken: 'cfadmin-token'
  },
  usageEvent: {
    state: 'STARTED',
    previousState: 'STOPPED',
    appGuid: 'test-app-guid',
    serviceLabel: 'test-service',
    eventGuid: 'event-guid',
    orgGuid: 'test-org',
    spaceGuid:'space-guid',
    instanceCount: 5,
    previousInstanceCount: 3,
    memoryPerInstance: 2,
    previousMemoryPerInstance: 6
  },
  env: {
    minimalAgeInMinutes,
    retryCount
  }
};

const eventTimestampGenerator = (function *() {
  const now = moment.now();
  let currentEventTimestamp = moment
    .utc(now)
    .subtract(minimalAgeInMinutes + 1, 'minutes')
    .valueOf();

  while (true)
    yield currentEventTimestamp++;
})();

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


module.exports = () => {
  let abacusCollectorMock;
  let cloudControllerMock;
  let uaaServerMock;

  let externalSystemsMocks;

  const getExternalSystemsMocks = () => {
    if (externalSystemsMocks)
      return externalSystemsMocks;


    abacusCollectorMock = createAbacusCollectorMock();
    cloudControllerMock = createCloudControllerMock();
    uaaServerMock = createUAAServerMock();

    externalSystemsMocks = {
      abacusCollector: abacusCollectorMock,
      cloudController: cloudControllerMock,
      uaaServer: uaaServerMock,
      startAll: () => {
        abacusCollectorMock.start();
        cloudControllerMock.start();
        uaaServerMock.start();
      },
      stopAll: (done) => {
        async.parallel([
          abacusCollectorMock.stop,
          cloudControllerMock.stop,
          uaaServerMock.stop
        ], done);
      }
    };

    return externalSystemsMocks;
  };

  const getEnviornmentVars = () => ({
    CLIENT_ID: defaults.oauth.abacusClientId,
    CLIENT_SECRET: defaults.oauth.abacusClientSecret,
    CF_CLIENT_ID : defaults.oauth.cfClientId,
    CF_CLIENT_SECRET : defaults.oauth.cfClientSecret,
    SECURED : 'true',
    ORGS_TO_REPORT : `["${defaults.usageEvent.orgGuid}"]`,
    AUTH_SERVER : `http://localhost:${uaaServerMock.address().port}`,
    API : `http://localhost:${cloudControllerMock.address().port}`,
    COLLECTOR : `http://localhost:${abacusCollectorMock.address().port}`,
    SERVICES : `{
      "${defaults.usageEvent.serviceLabel}":{"plans":["${defaults.usageEvent.servicePlanName}"]}
    }`,
    MIN_INTERVAL_TIME : 10,
    RETRIES: retryCount,
    GUID_MIN_AGE: minimalAgeInMinutesInMillis,
    JWTKEY : defaults.oauth.tokenSecret,
    JWTALGO : defaults.oauth.tokenAlgorithm
  });

  const bridge = {
    port: 9500,
    start: (config) => {
      if (!config.db)
        npm
          .useEnv(extend({}, process.env, getEnviornmentVars()))
          .startModules([npm.modules.pouchserver, npm.modules.applications]);
      else
        dbclient.drop(config.db, /^abacus-/, () => {
          npm
            .useEnv(extend({}, process.env, getEnviornmentVars()))
            .startModules(npm.modules.services);
        });
    },
    stop: (done) => npm.stopAllStarted(done)
  };

  return {
    defaults,
    usageEvent,
    collectorUsage,
    getExternalSystemsMocks,
    bridge
  };
};
