'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const _ = require('underscore');

const request = require('abacus-request');
const yieldable = require('abacus-yieldable');

const carryOverDb = require('./utils/carry-over-db');
const createTokenFactory = require('./utils/token-factory');
const serviceMock = require('./utils/service-mock-util');
const wait = require('./utils/wait');

let fixture;
let customTests = () => {};

const build = () => {

  context('when reading multiple events from Cloud Controller', () => {
    const firstEventGuid = 'event-guid-1';
    const secondEventGuid = 'event-guid-2';
    let externalSystemsMocks;
    let firstUsageEventTimestamp;
    let secondUsageEventTimestamp;

    before((done) => {
      externalSystemsMocks = fixture.getExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks
        .uaaServer
        .tokenService
        .whenScopes(fixture.oauth.abacusCollectorScopes)
        .return(fixture.oauth.abacusCollectorToken);

      externalSystemsMocks
        .uaaServer
        .tokenService
        .whenScopes(fixture.oauth.cfAdminScopes)
        .return(fixture.oauth.cfAdminToken);

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
      externalSystemsMocks.cloudController.usageEvents.return.firstTime([firstServiceUsageEvent]);
      externalSystemsMocks.cloudController.usageEvents.return.secondTime([secondServiceUsageEvent]);

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

      fixture.bridge.start(externalSystemsMocks);

      wait.until(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(4), done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });

    context('Bridge specific tests', () => {
      customTests(fixture);
    });

    context('Bridge generic tests', () => {

      it('verify Usage Events service calls ', () => {
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

      context('verify abacus collector', () => {
        it('expect two requests to be made to abacus collector', () => {
          expect(externalSystemsMocks.abacusCollector.collectUsageService.requests().length).to.equal(2);
        });

        it('verify first request', () => {
          expect(externalSystemsMocks.abacusCollector.collectUsageService.request(0)).to.deep.equal({
            token: fixture.oauth.abacusCollectorToken,
            usage: fixture.collectorUsage(firstUsageEventTimestamp)
          });
        });

        it('verify second request', () => {
          expect(externalSystemsMocks.abacusCollector.collectUsageService.request(1)).to.deep.equal({
            token: fixture.oauth.abacusCollectorToken,
            usage: fixture.collectorUsage(secondUsageEventTimestamp)
          });
        });

      });

      it('verify UAA calls', () => {
        const uaaServerMock = externalSystemsMocks.uaaServer;
        // Expect 2 calls for every token (abacus and cfadmin) per Worker and Master processes
        // TODO: check this!!!
        expect(uaaServerMock.tokenService.requestsCount()).to.equal(4);

        const abacusCollectorTokenRequests = uaaServerMock.tokenService.requests.withScopes(fixture.oauth.abacusCollectorScopes);
        expect(abacusCollectorTokenRequests).to.deep.equal(_(2).times(()=>({
          credentials: {
            clientId: fixture.env.abacusClientId,
            secret: fixture.env.abacusClientSecret
          },
          scopes: fixture.oauth.abacusCollectorScopes
        })));

        const cfAdminTokenRequests = uaaServerMock.tokenService.requests.withScopes(fixture.oauth.cfAdminScopes);
        expect(cfAdminTokenRequests).to.deep.equal(_(2).times(()=>({
          credentials: {
            clientId: fixture.env.cfClientId,
            secret: fixture.env.cfClientSecret
          },
          scopes: fixture.oauth.cfAdminScopes
        })));
      });

      it('verify carry-over content', (done) => yieldable.functioncb(function *() {
        const docs = yield carryOverDb.readCurrentMonthDocs();
        expect(docs).to.deep.equal([{
          collector_id: externalSystemsMocks.abacusCollector.collectUsageService.resourceLocation,
          event_guid: secondEventGuid,
          state: fixture.defaultUsageEvent.state,
          timestamp: secondUsageEventTimestamp }]);
      })((err) => {
        done(err);
      }));

      it('verify correct statistics are returned', (done) => {
        const tokenFactory = createTokenFactory(fixture.env.tokenSecret);
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

};

const testDef = {
  fixture: (value) => {
    fixture = value;
    return testDef;
  },
  customTests:  (value) => {
    customTests = value;
    return testDef;
  },
  build
};

module.exports = testDef;

// Why services bridge posts to 'batch' endpoint, but application not ?????
// review package.json
