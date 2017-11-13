'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const request = require('abacus-request');
const yieldable = require('abacus-yieldable');

const carryOverDb = require('./lib/carry-over-db');
const wait = require('./lib/wait');
const createFixture = require('./lib/application-bridge-fixture');
const createTokenFactory = require('./lib/token-factory');

const abacusCollectorScopes = ['abacus.usage.linux-container.write', 'abacus.usage.linux-container.read'];
const abacusCollectorToken = 'abacus-collector-token';
const cfAdminScopes = [];
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

      externalSystemsMocks.uaaServer.tokenService.whenScopes(abacusCollectorScopes).return(abacusCollectorToken);
      externalSystemsMocks.uaaServer.tokenService.whenScopes(cfAdminScopes).return(cfAdminToken);

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
      externalSystemsMocks.cloudController.applicationUsageEvents.return.firstTime([firstServiceUsageEvent]);
      externalSystemsMocks.cloudController.applicationUsageEvents.return.secondTime([secondServiceUsageEvent]);


      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

      fixture.bridge.start({ db: process.env.DB });

      wait.until(() => {
        return externalSystemsMocks.cloudController.applicationUsageEvents.requestsCount() >= 4;
      }, done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });

    context('verify cloud controller', () => {

      it('verify Service Usage Events service calls ', () => {
        const cloudControllerMock = externalSystemsMocks.cloudController;

        expect(cloudControllerMock.applicationUsageEvents.requests(0)).to.deep.equal({
          token: cfAdminToken,
          afterGuid: undefined
        });
        expect(cloudControllerMock.applicationUsageEvents.requests(1)).to.deep.equal({
          token: cfAdminToken,
          afterGuid: firstEventGuid
        });
        expect(cloudControllerMock.applicationUsageEvents.requests(2)).to.deep.equal({
          token: cfAdminToken,
          afterGuid: secondEventGuid
        });
        expect(cloudControllerMock.applicationUsageEvents.requests(3)).to.deep.equal({
          token: cfAdminToken,
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
      expect(uaaServerMock.tokenService.requestsCount()).to.equal(4);

      expect(uaaServerMock.tokenService.requests.withScopes(abacusCollectorScopes)).to.deep.equal([{
        credentials: {
          clientId: fixture.defaults.oauth.abacusClientId,
          secret: fixture.defaults.oauth.abacusClientSecret
        },
        scopes: abacusCollectorScopes
      },{
        credentials: {
          clientId: fixture.defaults.oauth.abacusClientId,
          secret: fixture.defaults.oauth.abacusClientSecret
        },
        scopes: abacusCollectorScopes
      }]);

      expect(uaaServerMock.tokenService.requests.withScopes(cfAdminScopes)).to.deep.equal([{
        credentials: {
          clientId: fixture.defaults.oauth.cfClientId,
          secret: fixture.defaults.oauth.cfClientSecret
        },
        scopes: cfAdminScopes
      },{
        credentials: {
          clientId: fixture.defaults.oauth.cfClientId,
          secret: fixture.defaults.oauth.cfClientSecret
        },
        scopes: cfAdminScopes
      }]);
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

});
