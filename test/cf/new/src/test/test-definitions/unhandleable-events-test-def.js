'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const yieldable = require('abacus-yieldable');

const carryOverDb = require('./utils/carry-over-db');
const serviceMock = require('./utils/service-mock-util');
const wait = require('./utils/wait');

let fixture;
let createUnhandleableEvents;

const build = () => {

  context('when reading unhandleable events from Cloud Controller', () => {
    let externalSystemsMocks;
    let unhandleableEvents;

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

      unhandleableEvents = createUnhandleableEvents(fixture);
      externalSystemsMocks
        .cloudController
        .usageEvents
        .return
        .firstTime(unhandleableEvents);

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

      fixture.bridge.start(externalSystemsMocks);

      wait.until(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(2), done);

    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });

    it('Abacus collector does not receive any usage', () => {
      expect(externalSystemsMocks.abacusCollector.collectUsageService.requests().length).to.equal(0);
    });

    it('Does not write an entry in carry over', yieldable.functioncb(function *() {
      const docs = yield carryOverDb.readCurrentMonthDocs();
      expect(docs).to.deep.equal([]);
    }));

    it('Exposes correct statistics', (done) => {
      fixture.bridge.readStats.withValidToken((err, response) => {
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(response.body.statistics.usage).to.deep.equal({
          success : {
            all: unhandleableEvents.length,
            conflicts: 0,
            skips: unhandleableEvents.length
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
  unhandleableEvents: (value) => {
    createUnhandleableEvents = value;
    return testDef;
  },
  build
};

module.exports = testDef;
