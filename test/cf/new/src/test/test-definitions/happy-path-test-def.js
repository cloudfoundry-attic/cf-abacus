'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const request = require('abacus-request');
const yieldable = require('abacus-yieldable');

const carryOverDb = require('./../lib/carry-over-db');
const wait = require('./../lib/wait');
const createTokenFactory = require('./../lib/token-factory');

let fixture;
let customBefore = () => {};
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

      customBefore(fixture);

      externalSystemsMocks
        .uaaServer
        .tokenService
        .whenScopes(fixture.defaults.oauth.abacusCollectorScopes)
        .return(fixture.defaults.oauth.abacusCollectorToken);

      externalSystemsMocks
        .uaaServer
        .tokenService
        .whenScopes(fixture.defaults.oauth.cfAdminScopes)
        .return(fixture.defaults.oauth.cfAdminToken);

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

      fixture.bridge.start({ db: process.env.DB });

      wait.until(() => {
        return externalSystemsMocks.cloudController.usageEvents.requestsCount() >= 4;
      }, done);
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

      it('verify Service Usage Events service calls ', () => {
        const cloudControllerMock = externalSystemsMocks.cloudController;

        expect(cloudControllerMock.usageEvents.requests(0)).to.include({
          token: fixture.defaults.oauth.cfAdminToken,
          afterGuid: undefined
        });
        expect(cloudControllerMock.usageEvents.requests(1)).to.include({
          token: fixture.defaults.oauth.cfAdminToken,
          afterGuid: firstEventGuid
        });
        expect(cloudControllerMock.usageEvents.requests(2)).to.include({
          token: fixture.defaults.oauth.cfAdminToken,
          afterGuid: secondEventGuid
        });
        expect(cloudControllerMock.usageEvents.requests(3)).to.include({
          token: fixture.defaults.oauth.cfAdminToken,
          afterGuid: secondEventGuid
        });
      });

      context('verify abacus collector', () => {
        it('expect two requests to be made to abacus collector', () => {
          expect(externalSystemsMocks.abacusCollector.collectUsageService.requestsCount()).to.equal(2);
        });

        it('verify first request', () => {
          expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(0)).to.deep.equal({
            token: fixture.defaults.oauth.abacusCollectorToken,
            usage: fixture.collectorUsage(firstUsageEventTimestamp)
          });
        });

        it('verify second request', () => {
          expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(1)).to.deep.equal({
            token: fixture.defaults.oauth.abacusCollectorToken,
            usage: fixture.collectorUsage(secondUsageEventTimestamp)
          });
        });

      });

      it('verify UAA calls', () => {
        const uaaServerMock = externalSystemsMocks.uaaServer;
        // Expect 2 calls for every token (abacus and cfadmin) per Worker and Master processes
        // TODO: check this!!!
        expect(uaaServerMock.tokenService.requestsCount()).to.equal(4);

        expect(uaaServerMock.tokenService.requests.withScopes(fixture.defaults.oauth.abacusCollectorScopes)).to.deep.equal([{
          credentials: {
            clientId: fixture.defaults.oauth.abacusClientId,
            secret: fixture.defaults.oauth.abacusClientSecret
          },
          scopes: fixture.defaults.oauth.abacusCollectorScopes
        },{
          credentials: {
            clientId: fixture.defaults.oauth.abacusClientId,
            secret: fixture.defaults.oauth.abacusClientSecret
          },
          scopes: fixture.defaults.oauth.abacusCollectorScopes
        }]);

        expect(uaaServerMock.tokenService.requests.withScopes(fixture.defaults.oauth.cfAdminScopes)).to.deep.equal([{
          credentials: {
            clientId: fixture.defaults.oauth.cfClientId,
            secret: fixture.defaults.oauth.cfClientSecret
          },
          scopes: fixture.defaults.oauth.cfAdminScopes
        },{
          credentials: {
            clientId: fixture.defaults.oauth.cfClientId,
            secret: fixture.defaults.oauth.cfClientSecret
          },
          scopes: fixture.defaults.oauth.cfAdminScopes
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

};


const testDef = {
  fixture: (value) => {
    fixture = value;
    return testDef;
  },
  before: (value) => {
    customBefore = value;
    return testDef;
  },
  customTests:  (value) => {
    customTests = value;
    return testDef;
  },
  build
};

module.exports = testDef;
