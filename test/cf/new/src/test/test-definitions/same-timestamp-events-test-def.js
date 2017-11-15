'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');
const request = require('abacus-request');

const createTokenFactory = require('./../lib/token-factory');
const wait = require('./../lib/wait');

let fixture;
let customBefore = () => {};

const build = () => {

  context('when reading multiple events with same timestamp from Cloud Controller', () => {
    let externalSystemsMocks;
    let usageEventsTimestamp;

    before((done) => {
      externalSystemsMocks = fixture.getExternalSystemsMocks();
      externalSystemsMocks.startAll();

      customBefore(fixture);

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

      const now = moment.now();
      usageEventsTimestamp = moment
        .utc(now)
        .subtract(fixture.env.minimalAgeInMinutes + 1, 'minutes')
        .valueOf();
      const firstUsageEvent = fixture
        .usageEvent()
        .overwriteCreatedAt(usageEventsTimestamp)
        .get();
      const secondUsageEvent = fixture
        .usageEvent()
        .overwriteCreatedAt(usageEventsTimestamp)
        .get();

      externalSystemsMocks.cloudController.usageEvents.return.firstTime([
        firstUsageEvent,
        secondUsageEvent
      ]);

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

      fixture.bridge.start(externalSystemsMocks);

      wait.until(() => {
        return externalSystemsMocks.cloudController.usageEvents.requestsCount() >= 2;
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
            conflicts: 0,
            skips: 0
          },
          failures : 0
        });
        done();
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
  build
};

module.exports = testDef;
