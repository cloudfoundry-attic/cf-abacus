'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');
const request = require('abacus-request');

const createFixture = require('./lib/service-bridge-fixture');
const createTokenFactory = require('./lib/token-factory');
const wait = require('./lib/wait');

const abacusCollectorToken = 'abacus-collector-token';
const cfAdminToken = 'cfadmin-token';

describe('service-bridge-test', () => {

  context('when reading multiple events with same timestamp', () => {
    let fixture;
    let externalSystemsMocks;

    let usageEventsTimestamp;

    before((done) => {
      fixture = createFixture();
      externalSystemsMocks = fixture.createExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService.forAbacusCollectorToken.return.always(abacusCollectorToken);
      externalSystemsMocks.uaaServer.tokenService.forCfAdminToken.return.always(cfAdminToken);

      const now = moment.now();
      usageEventsTimestamp = moment
        .utc(now)
        .subtract(fixture.defaults.minimalAgeInMinutes + 1, 'minutes')
        .valueOf();
      const firstUsageEvent = fixture
        .usageEvent()
        .overwriteEventGuid('event-guid-1')
        .overwriteCreatedAt(usageEventsTimestamp)
        .get();
      const secondUsageEvent = fixture
        .usageEvent()
        .overwriteEventGuid('event-guid-2')
        .overwriteCreatedAt(usageEventsTimestamp)
        .get();

      externalSystemsMocks.cloudController.serviceUsageEvents.return.firstTime([
        firstUsageEvent,
        secondUsageEvent
      ]);
      externalSystemsMocks.cloudController.serviceGuids.return.always({
        [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
      });

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

      fixture.bridge.start({ db: process.env.DB });

      wait.until(() => {
        return externalSystemsMocks.cloudController.serviceUsageEvents.requestsCount() >= 2;
      }, done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });

    context('when verifing abacus collector', () => {
      const expectedUsage = (timestamp) => ({
        start: timestamp,
        end: timestamp,
        organization_id: fixture.defaults.usageEvent.orgGuid,
        space_id: fixture.defaults.usageEvent.spaceGuid,
        consumer_id: `service:${fixture.defaults.usageEvent.serviceInstanceGuid}`,
        resource_id: fixture.defaults.usageEvent.serviceLabel,
        plan_id: fixture.defaults.usageEvent.servicePlanName,
        resource_instance_id: `service:${fixture.defaults.usageEvent.serviceInstanceGuid}:${fixture.defaults.usageEvent.servicePlanName}:${fixture.defaults.usageEvent.serviceLabel}`,
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

      it('expect two usages to be send to abacus collector', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requestsCount()).to.equal(2);
      });
  
      it('expect first recieved usage to be as it is', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(0).usage)
          .to.deep.equal(expectedUsage(usageEventsTimestamp));
      });
  
      it('expect second recieved usage timestamp to be adjusted', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(1).usage)
          .to.deep.equal(expectedUsage(usageEventsTimestamp + 1));
      });
  
    });
    
    it('expect statistics with all events successfully processed', (done) => {
      const tokenFactory = createTokenFactory(fixture.defaults.oauth.tokenSecret);
      const signedToken = tokenFactory.create(['abacus.usage.read']);
      request.get('http://localhost::port/v1/stats', {
        port: fixture.bridge.port,
        headers: {
          authorization: `Bearer ${signedToken}`
        }
      }, (error, response) => {
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(response.body.statistics.usage).to.deep.equal({
          success : {
            all: 2,
            conflicts: 0,
            skips: 0
          },
          failures : 0
        });
        done();
      });
    });

  });

});
