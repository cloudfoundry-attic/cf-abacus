'use strict';

const { functioncb, yieldable } = require('abacus-yieldable');
const createEventReader = require('./helpers/event-reader');

const env = {
  api: process.env.CF_API_URI,
  user: process.env.CF_ADMIN_USER,
  password: process.env.CF_ADMIN_PASSWORD,
  cloudControllerClientId: process.env.CLOUD_CONTROLLER_CLIENT_ID,
  cloudControllerClientSecret: process.env.CLOUD_CONTROLLER_CLIENT_SECRET
};

const oauth = require('abacus-oauth');
const cmdline = require('abacus-cmdline').cfutils(env.api, env.user, env.password);

const oneMinuteInMillis = 60 * 1000;
const fiveMinutesInMillis = 5 * oneMinuteInMillis;

describe('usage events tests', () => {
  const testOrg = 'abacus-cc-acceptance-test';
  const testSpace = 'test';
  const testApp = 'staticapp';

  let token;
  let orgGuid;
  let spaceGuid;

  before(functioncb(function*() {
    const createdOrg = cmdline.org.create(testOrg);
    orgGuid = createdOrg.metadata.guid;
    const createdSpace = cmdline.space.create(orgGuid, testSpace);
    spaceGuid = createdSpace.metadata.guid;

    token = oauth.cache(
      env.api,
      env.cloudControllerClientId,
      env.cloudControllerClientSecret
    );

    try {
      yield yieldable(token.start)();
    } catch(e) {
      // If test is executed on a cloud foundry that uses self signed certificate
      // you should export SKIP_SSL_VALIDATION="true" in order oauth.cache() to work properly.
      if (e.message == 'self signed certificate')
        throw new Error('Self signed certificate used. If this is intended export SKIP_SSL_VALIDATION="true" ');
    }
  }));

  after(() => {
    cmdline.org.delete(orgGuid);
  });

  describe('app_usage_events', () => {
    const testAppMemoryInMb = 256;
    let events;

    before(functioncb(function*() {
      // Application start and stop could be slow if landscapecd .. is overloaded
      this.timeout(fiveMinutesInMillis);

      const eventReader = createEventReader(env.api, 'app_usage_events', orgGuid, token);
      const lastEvent = yield eventReader.readLastEvent();
      const lastGuid = lastEvent.metadata.guid;

      const application = cmdline.application(testOrg, testSpace);
      application.deploy(testApp, {
        path: `${__dirname}/static-app`,
        buildpack: 'staticfile_buildpack',
        memory: `${testAppMemoryInMb}M`
      });
      application.delete(testApp);

      events = yield eventReader.read({
        afterGuid: lastGuid
      }).waitForStates(['STARTED', 'STOPPED']);
    }));

    const verifyAppEventStates = ({ currentState, previousState }) => {
      const eventsWithState = events.filter((event) => event.entity.state === currentState);
      expect(eventsWithState.length).to.equal(1);
      expect(eventsWithState[0].entity).to.includes({
        state: currentState,
        previous_state: previousState,
        memory_in_mb_per_instance: testAppMemoryInMb,
        previous_memory_in_mb_per_instance: testAppMemoryInMb,
        instance_count: 1,
        previous_instance_count: 1,
        app_name: 'staticapp',
        space_name: 'test'
      });
    };

    it('START event have proper attributes', () => {
      verifyAppEventStates({
        currentState: 'STARTED',
        previousState: 'STOPPED'
      });
    });

    it('STOP event have proper attributes', () => {
      verifyAppEventStates({
        currentState: 'STOPPED',
        previousState: 'STARTED'
      });
    });
  });

  describe('service_usage_events', () => {
    const testServiceName = 'application-logs';
    const testServicePlanName = 'lite';
    const testServiceInstanceName = 'test_service';

    let events;

    before(functioncb(function*() {
      // Service create and delete could be slow if landscape is overloaded
      this.timeout(fiveMinutesInMillis);

      const eventReader = createEventReader(env.api, 'service_usage_events', orgGuid, token);
      const lastEvent = yield eventReader.readLastEvent();
      const lastGuid = lastEvent.metadata.guid;

      const serviceInstance = cmdline.serviceInstance.create(
        testServiceInstanceName,
        testServiceName,
        testServicePlanName,
        spaceGuid);
      cmdline.serviceInstance.delete(serviceInstance.metadata.guid);

      events = yield eventReader.read({
        afterGuid: lastGuid
      }).waitForStates(['CREATED', 'DELETED']);
    }));

    const verifyServiceEventState = (state) => {
      const eventsWithState = events.filter((event) => event.entity.state === state);
      expect(eventsWithState.length).to.equal(1);
      expect(eventsWithState[0].entity).to.includes({
        state: state,
        service_instance_name: testServiceInstanceName,
        service_instance_type: 'managed_service_instance',
        service_plan_name: testServicePlanName,
        service_label: testServiceName
      });
    };

    it('CREATED event have proper attributes', () => {
      verifyServiceEventState('CREATED');
    });

    it('DELETED event have proper attributes', () => {
      verifyServiceEventState('DELETED');
    });
  });
});
