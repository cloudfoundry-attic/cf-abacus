'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');
const request = require('abacus-request');

const createFixture = require('./lib/service-bridge-fixture');
const createTokenFactory = require('./lib/token-factory');
const wait = require('./lib/wait');

const abacusCollectorScopes = ['abacus.usage.write', 'abacus.usage.read'];
const abacusCollectorToken = 'abacus-collector-token';
const cfAdminScopes = [];
const cfAdminToken = 'cfadmin-token';

describe('service-bridge-test', () => {

  context('when reading multiple events with same timestamp from Cloud Controller', () => {
    let fixture;
    let externalSystemsMocks;

    let usageEventsTimestamp;

    before((done) => {
      fixture = createFixture();
      externalSystemsMocks = fixture.createExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService.whenScopes(abacusCollectorScopes).return(abacusCollectorToken);
      externalSystemsMocks.uaaServer.tokenService.whenScopes(cfAdminScopes).return(cfAdminToken);

      const now = moment.now();
      usageEventsTimestamp = moment
        .utc(now)
        .subtract(fixture.defaults.env.minimalAgeInMinutes + 1, 'minutes')
        .valueOf();
      const firstUsageEvent = fixture
        .usageEvent()
        .overwriteCreatedAt(usageEventsTimestamp)
        .get();
      const secondUsageEvent = fixture
        .usageEvent()
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
      it('expect two usages to be send to abacus collector', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requestsCount()).to.equal(2);
      });

      it('expect first recieved usage to be as it is', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(0).usage)
          .to.deep.equal(fixture.collectorUsage(usageEventsTimestamp));
      });

      it('expect second recieved usage timestamp to be adjusted', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(1).usage)
          .to.deep.equal(fixture.collectorUsage(usageEventsTimestamp + 1));
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
