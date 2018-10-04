'use strict';

const httpStatus = require('http-status-codes');
const _ = require('underscore');

const yieldable = require('abacus-yieldable');
const createWait = require('abacus-wait');

const { carryOverDb } = require('abacus-test-helper');
const { serviceMock } = require('abacus-mock-util');

const waitUntil = yieldable(createWait().until);

let fixture;
let customTests = () => {};

const build = () => {
  context('when reading multiple events from Cloud Controller', () => {
    const firstEventGuid = 'event-guid-1';
    const secondEventGuid = 'event-guid-2';
    let externalSystemsMocks;
    let firstUsageEventTimestamp;
    let secondUsageEventTimestamp;

    before(
      yieldable.functioncb(function*() {
        externalSystemsMocks = fixture.externalSystemsMocks();
        externalSystemsMocks.startAll();

        externalSystemsMocks.uaaServer.tokenService
          .whenScopesAre(fixture.oauth.abacusCollectorScopes)
          .return(fixture.oauth.abacusCollectorToken);

        externalSystemsMocks.uaaServer.tokenService
          .whenScopesAre(fixture.oauth.cfAdminScopes)
          .return(fixture.oauth.cfAdminToken);

        const firstServiceUsageEvent = fixture
          .usageEvent()
          .overwriteEventGuid(firstEventGuid)
          .get();
        firstUsageEventTimestamp = firstServiceUsageEvent.metadata.created_at;
        externalSystemsMocks.cloudController.usageEvents.return.firstTime([firstServiceUsageEvent]);

        const secondServiceUsageEvent = fixture
          .usageEvent()
          .overwriteEventGuid(secondEventGuid)
          .get();
        secondUsageEventTimestamp = secondServiceUsageEvent.metadata.created_at;
        externalSystemsMocks.cloudController.usageEvents.return.secondTime([secondServiceUsageEvent]);

        externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.ACCEPTED);

        yield carryOverDb.setup();
        fixture.bridge.start(externalSystemsMocks);

        yield waitUntil(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(4));
      })
    );

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    describe('Bridge specific tests', () => {
      customTests(fixture);
    });

    describe('Bridge generic tests', () => {
      it('Usage Events Service is called with correct arguments', () => {
        const cloudControllerMock = externalSystemsMocks.cloudController;

        expect(cloudControllerMock.usageEvents.request(0)).to.include({
          token: fixture.oauth.cfAdminToken,
          afterGuid: undefined
        });
        expect(cloudControllerMock.usageEvents.request(1)).to.include({
          token: fixture.oauth.cfAdminToken,
          afterGuid: firstEventGuid
        });
        expect(cloudControllerMock.usageEvents.request(2)).to.include({
          token: fixture.oauth.cfAdminToken,
          afterGuid: secondEventGuid
        });
        expect(cloudControllerMock.usageEvents.request(3)).to.include({
          token: fixture.oauth.cfAdminToken,
          afterGuid: secondEventGuid
        });
      });

      it('Collect Usage Service is called with correct arguments', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests().length).to.equal(2);

        expect(externalSystemsMocks.abacusCollector.collectUsageService.request(0)).to.deep.equal({
          token: fixture.oauth.abacusCollectorToken,
          usage: fixture.collectorUsage()
            .overwriteUsageTime(firstUsageEventTimestamp)
            .overwriteMeasuredUsage(fixture.usageEventStates.default)
            .get()
        });

        expect(externalSystemsMocks.abacusCollector.collectUsageService.request(1)).to.deep.equal({
          token: fixture.oauth.abacusCollectorToken,
          usage: fixture.collectorUsage()
            .overwriteUsageTime(secondUsageEventTimestamp)
            .overwriteMeasuredUsage(fixture.usageEventStates.default)
            .get()
        });
      });

      it('Get OAuth Token Service is called with correct arguments', () => {
        const uaaServerMock = externalSystemsMocks.uaaServer;
        // Expect 2 calls for every token (abacus and cfadmin)
        // per Worker and Master processes
        expect(uaaServerMock.tokenService.requestsCount()).to.equal(4);

        const abacusCollectorTokenRequests = uaaServerMock.tokenService.requests.withScopes(
          fixture.oauth.abacusCollectorScopes
        );

        expect(abacusCollectorTokenRequests).to.deep.equal(
          _(2).times(() => ({
            credentials: {
              clientId: fixture.env.abacusClientId,
              secret: fixture.env.abacusClientSecret
            },
            scopes: fixture.oauth.abacusCollectorScopes
          }))
        );

        const cfAdminTokenRequests = uaaServerMock.tokenService.requests.withScopes(fixture.oauth.cfAdminScopes);

        expect(cfAdminTokenRequests).to.deep.equal(
          _(2).times(() => ({
            credentials: {
              clientId: fixture.env.cfClientId,
              secret: fixture.env.cfClientSecret
            },
            scopes: fixture.oauth.cfAdminScopes
          }))
        );
      });

      it('Writes an entry in carry-over', yieldable.functioncb(function*() {
        const docs = yield carryOverDb.readCurrentMonthDocs();
        const expectedCollectorId = externalSystemsMocks.abacusCollector.resourceLocation;
        expect(docs).to.deep.equal([{
          collector_id: expectedCollectorId,
          event_guid: secondEventGuid,
          state: fixture.defaultUsageEvent.state,
          timestamp: secondUsageEventTimestamp
        }]);
      }));

      it('Exposes correct statistics', yieldable.functioncb(function*() {
        const response = yield fixture.bridge.readStats.withValidToken();
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(response.body.statistics.usage).to.deep.equal({
          success: {
            all: 2,
            conflicts: 0,
            notsupported: 0,
            skips: 0
          },
          failures: 0
        });
      }));
    });
  });
};

const testDef = {
  fixture: (value) => {
    fixture = value;
    return testDef;
  },
  customTests: (value) => {
    customTests = value;
    return testDef;
  },
  build
};

module.exports = testDef;
