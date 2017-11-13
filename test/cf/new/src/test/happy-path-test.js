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
        return externalSystemsMocks.cloudController.serviceUsageEvents.requestsCount() >= 4;
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
        expect(cloudControllerMock.serviceUsageEvents.requests(3)).to.deep.equal({
          token: cfAdminToken,
          serviceGuids: [fixture.defaults.usageEvent.serviceGuid],
          afterGuid: secondEventGuid
        });
      });
    });

    context('verify abacus collector', () => {
      it('expect two requests to be made to abacus collector', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requestsCount()).to.equal(2);
      });

      it('verify first request', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(0)).to.deep.equal({
          token: abacusCollectorToken,
          usage: fixture.collectorUsage(firstUsageEventTimestamp)
        });
      });

      it('verify second request', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(1)).to.deep.equal({
          token: abacusCollectorToken,
          usage: fixture.collectorUsage(secondUsageEventTimestamp)
        });
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

    it('verify correct statistics are returned', (done) => {
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
            conflicts : 0,
            skips : 0
          },
          failures : 0
        });
        done();
      });
    });

  });

  // Cloud Controller cannot find GUID "%s". Restarting reporting, starting from epoch.

  // think of a way to start and stop bridge only once.

});
