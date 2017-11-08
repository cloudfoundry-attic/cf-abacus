'use sterict';

const async = require('async');
const extend = require('underscore').extend;

const dbclient = require('abacus-dbclient');
const npm = require('abacus-npm');
const moment = require('abacus-moment');

const createAbacusCollectorMock = require('./abacus-collector-mock');
const createCloudControllerMock = require('./cloud-controller-mock');
const createUAAServerMock = require('./uaa-server-mock');

const defaults = {
  oauth: {
    tokenSecret: 'secret',
    tokenAlgorithm: 'HS256',
    cfClientId: 'cf-client-id',
    cfClientSecret: 'cf-client-secret',
    abacusClientId: 'abacus-collector-client-id',
    abacusClientSecret: 'abacus-collector-client-secret'
  },
  usageEvent: {
    serviceGuid: 'test-service-guid',
    serviceLabel: 'test-service',
    eventGuid: 'event-guid',
    orgGuid: 'test-org',
    spaceGuid:'space-guid',
    servicePlanName:'test-plan',
    serviceInstanceGuid: 'service-instance-guid'
  }
};

const validUsageEvent = (eventTimestamp) => ({
  metadata: {
    created_at: eventTimestamp,
    guid: defaults.usageEvent.eventGuid
  },
  entity: {
    state: 'CREATED',
    org_guid: defaults.usageEvent.orgGuid,
    space_guid: defaults.usageEvent.spaceGuid,
    service_label: defaults.usageEvent.serviceLabel,
    service_plan_name: defaults.usageEvent.servicePlanName,
    service_instance_guid: defaults.usageEvent.serviceInstanceGuid
  }
});

const usageEvent = () => {
  const now = moment.now();
  const eventTimestamp = moment.utc(now).subtract(3, 'minutes').valueOf();

  const resultUsageEvent = validUsageEvent(eventTimestamp);

  const overwritable = {
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


module.exports = () => {
  let abacusCollectorMock;
  let cloudControllerMock;
  let uaaServerMock;

  const createExternalSystemsMocks = () => {
    abacusCollectorMock = createAbacusCollectorMock();
    cloudControllerMock = createCloudControllerMock();
    uaaServerMock = createUAAServerMock();

    return {
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
    JWTKEY : defaults.oauth.tokenSecret,
    JWTALGO : defaults.oauth.tokenAlgorithm
  });

  const bridge = {
    start: (config) => {
      if (!config.db)
        npm
          .useEnv(extend({}, process.env, getEnviornmentVars()))
          .startModules([npm.modules.pouchserver, npm.modules.services]);
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
    createExternalSystemsMocks,
    bridge: bridge
  };
};
