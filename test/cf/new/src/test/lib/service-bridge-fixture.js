'use sterict';

const async = require('async');

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

  const customEnviornmentVars = () => {
    process.env.CLIENT_ID = defaults.oauth.abacusClientId;
    process.env.CLIENT_SECRET = defaults.oauth.abacusClientSecret;
    process.env.CF_CLIENT_ID = defaults.oauth.cfClientId;
    process.env.CF_CLIENT_SECRET = defaults.oauth.cfClientSecret;
    process.env.SECURED = 'true';
    process.env.ORGS_TO_REPORT = `["${defaults.usageEvent.orgGuid}"]`;
    process.env.AUTH_SERVER = `http://localhost:${uaaServerMock.address().port}`;
    process.env.API = `http://localhost:${cloudControllerMock.address().port}`;
    process.env.COLLECTOR = `http://localhost:${abacusCollectorMock.address().port}`;
    process.env.SERVICES = `{
      "${defaults.usageEvent.serviceLabel}":{"plans":["${defaults.usageEvent.servicePlanName}"]}
    }`;
    process.env.MIN_INTERVAL_TIME = 10;
    process.env.JWTKEY = defaults.oauth.tokenSecret;
    process.env.JWTALGO = defaults.oauth.tokenAlgorithm;
  };

  const bridge = {
    start: (config) => {
      if (!config.db)
        npm.startModules([npm.modules.pouchserver, npm.modules.services]);
      else
        dbclient.drop(config.db, /^abacus-/, () => {
          npm.startModules(npm.modules.services);
        });
    },
    stop: (done) => npm.stopAllStarted(done)
  };

  return {
    defaults,
    usageEvent,
    customEnviornmentVars,
    createExternalSystemsMocks,
    bridge: bridge
  };
};
