'use strict';

const httpStatus = require('http-status-codes');

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const carryOverDb = require('./utils/carry-over-db');
const serviceMock = require('./utils/service-mock-util');
const wait = require('./utils/wait');

const waitUntil = yieldable(wait.until);

let fixture;

const build = () => {

  context('when reading multiple events with same timestamp from Cloud Controller', () => {
    let externalSystemsMocks;
    let usageEventsTimestamp;

    before(yieldable.functioncb(function *() {
      externalSystemsMocks = fixture.externalSystemsMocks();
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

      yield carryOverDb.setup();
      fixture.bridge.start(externalSystemsMocks);

      yield waitUntil(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(2));
    }));

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    context('When abacus collector is called', () => {
      it('Two usages are sent', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requests().length).to.equal(2);
      });

      it('First recieved usage is as it was sent', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.request(0).usage)
          .to.deep.equal(fixture.collectorUsage(usageEventsTimestamp));
      });

      it('Second recieved usage timestamp is adjusted', () => {
        expect(externalSystemsMocks.abacusCollector.collectUsageService.request(1).usage)
          .to.deep.equal(fixture.collectorUsage(usageEventsTimestamp + 1));
      });
    });

    it('Exposes correct statistics', (done) => {
      fixture.bridge.readStats.withValidToken((err, response) => {
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(response.body.statistics.usage).to.deep.equal({
          success : {
            all: 2,
            conflicts: 0,
            skips: 0
          },
          failures : 0
        });
        done(err);
      });
    });

  });
};

const testDef = {
  fixture: (value) => {
    fixture = value;
    return testDef;
  },
  build
};

module.exports = testDef;
