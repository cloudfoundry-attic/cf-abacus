'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const request = require('abacus-request');
const yieldable = require('abacus-yieldable');

const carryOverDb = require('./lib/carry-over-db');
const wait = require('./lib/wait');
const createFixture = require('./lib/service-bridge-fixture');
const createTokenFactory = require('./lib/token-factory');

const abacusCollectorToken = 'abacus-collector-token';
const cfAdminToken = 'cfadmin-token';

describe('service-bridge-test', () => {

  context('when all external systems are working', () => {
    const firstEventGuid = 'event-guid-1';
    const secondEventGuid = 'event-guid-2';
    let fixture;
    let externalSystemsMocks;
    let firstUsageEventTimestamp;
    let secondUsageEventTimestamp;

    before((done) => {
      fixture = createFixture();

      externalSystemsMocks = fixture.createExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService.forAbacusCollectorToken.return.always(abacusCollectorToken);
      externalSystemsMocks.uaaServer.tokenService.forCfAdminToken.return.always(cfAdminToken);

      const firstServiceUsageEvent = fixture
        .usageEvent()
        .overwriteEventGuid(firstEventGuid)
        .get();
      firstUsageEventTimestamp = firstServiceUsageEvent.metadata.created_at;
      const secondServiceUsageEvent = fixture
        .usageEvent()
        .overwriteEventGuid(secondEventGuid)
        .get();
      secondUsageEventTimestamp = secondServiceUsageEvent.metadata.created_at;
      externalSystemsMocks.cloudController.serviceUsageEvents.return.firstTime([firstServiceUsageEvent]);
      externalSystemsMocks.cloudController.serviceUsageEvents.return.secondTime([secondServiceUsageEvent]);

      externalSystemsMocks.cloudController.serviceGuids.return.always({
        [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
      });

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

      fixture.bridge.start({ db: process.env.DB });

      wait.until(() => {
        return externalSystemsMocks.cloudController.serviceUsageEvents.requestsCount() >= 3;
      }, done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });

    context('verify cloud controller', () => {
      it('verify Services service calls', () => {
        const cloudControllerMock = externalSystemsMocks.cloudController;
  
        // Expect 2 calls as configuration is load by both Master and Worker process
        expect(cloudControllerMock.serviceGuids.requestsCount()).to.equal(2);
        expect(cloudControllerMock.serviceGuids.requests(0)).to.deep.equal({
          token: cfAdminToken,
          serviceLabels: [fixture.defaults.usageEvent.serviceLabel]
        });
        expect(cloudControllerMock.serviceGuids.requests(1)).to.deep.equal({
          token: cfAdminToken,
          serviceLabels: [fixture.defaults.usageEvent.serviceLabel]
        });
      });

      it('verify Service Usage Events service calls ', () => {
        const cloudControllerMock = externalSystemsMocks.cloudController;
  
        expect(cloudControllerMock.serviceUsageEvents.requests(0)).to.deep.equal({
          token: cfAdminToken,
          serviceGuids: [fixture.defaults.usageEvent.serviceGuid],
          afterGuid: undefined
        });
        expect(cloudControllerMock.serviceUsageEvents.requests(1)).to.deep.equal({
          token: cfAdminToken,
          serviceGuids: [fixture.defaults.usageEvent.serviceGuid],
          afterGuid: firstEventGuid
        });
        expect(cloudControllerMock.serviceUsageEvents.requests(2)).to.deep.equal({
          token: cfAdminToken,
          serviceGuids: [fixture.defaults.usageEvent.serviceGuid],
          afterGuid: secondEventGuid
        });
      });
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
          .to.deep.equal(expectedUsage(firstUsageEventTimestamp));
      });
  
      it('expect second recieved usage timestamp to be adjusted', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(1).usage)
          .to.deep.equal(expectedUsage(secondUsageEventTimestamp));
      });
  
    });

    it('verify UAA calls', () => {
      const uaaServerMock = externalSystemsMocks.uaaServer;
      // Expect 2 calls for every token (abacus and cfadmin) per Worker and Master processes
      // TODO: check this!!!
      expect(uaaServerMock.tokenService.forAbacusCollectorToken.requestsCount()).to.equal(2);
      expect(uaaServerMock.tokenService.forCfAdminToken.requestsCount()).to.equal(2);

      expect(uaaServerMock.tokenService.forAbacusCollectorToken.requests(0)).to.deep.equal({
        clientId: fixture.defaults.oauth.abacusClientId,
        secret: fixture.defaults.oauth.abacusClientSecret
      });
      expect(uaaServerMock.tokenService.forCfAdminToken.requests(0)).to.deep.equal({
        clientId: fixture.defaults.oauth.cfClientId,
        secret: fixture.defaults.oauth.cfClientSecret
      });
    });

    it('verify carry-over content', (done) => yieldable.functioncb(function *() {
      const docs = yield carryOverDb.readCurrentMonthDocs();
      expect(docs).to.deep.equal([{
        collector_id: externalSystemsMocks.abacusCollector.collectUsageService.resourceLocation,
        event_guid: secondEventGuid,
        state: fixture.defaults.usageEvent.state,
        timestamp: secondUsageEventTimestamp }]);
    })((err) => {
      done(err);
    }));

    context('when requesting statistics', () => {
      let tokenFactory;

      before(() => {
        tokenFactory = createTokenFactory(fixture.defaults.oauth.tokenSecret);
      });

      context('with NO token', () => {
        it('UNAUTHORIZED is returned', (done) => {
          request.get('http://localhost::port/v1/stats', {
            port: fixture.bridge.port
          }, (error, response) => {
            expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
            done();
          });
        });
      });

      context('with token with NO required scopes', () => {
        it('FORBIDDEN is returned', (done) => {
          const signedToken = tokenFactory.create(['abacus.usage.invalid']);
          request.get('http://localhost::port/v1/stats', {
            port: fixture.bridge.port,
            headers: {
              authorization: `Bearer ${signedToken}`
            }
          }, (error, response) => {
            expect(response.statusCode).to.equal(httpStatus.FORBIDDEN);
            done();
          });
        });
      });

      context('with token with required scopes', () => {
        it('correct statistics are returned', (done) => {
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
                conflicts : 0,
                skips : 0
              },
              failures : 0
            });
            done();
          });
        });
      });


    });

  });

  // retry(s)
  // behavior when some external system is not available
  // Cloud Controller cannot find GUID "%s". Restarting reporting, starting from epoch.

  // think of a way to start and stop bridge only once.

});
