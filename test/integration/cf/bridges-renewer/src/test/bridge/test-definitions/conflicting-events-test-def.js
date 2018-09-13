'use strict';

const httpStatus = require('http-status-codes');

const yieldable = require('abacus-yieldable');

const carryOverDb = require('../../utils/carry-over-db');
const serviceMock = require('../..//utils/service-mock-util');
const createWait = require('abacus-wait');

const waitUntil = yieldable(createWait().until);

let fixture;

const build = () => {
  context('when bridge sends conflicting usage documents', () => {
    let externalSystemsMocks;

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

        const serviceUsageEvent = fixture.usageEvent().get();
        externalSystemsMocks.cloudController.usageEvents.return.firstTime([serviceUsageEvent]);

        externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CONFLICT);

        yield carryOverDb.setup();
        fixture.bridge.start(externalSystemsMocks);

        yield waitUntil(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(2));
      })
    );

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    it('Abacus collector received the conflicting usage', () => {
      expect(externalSystemsMocks.abacusCollector.collectUsageService.requests().length).to.equal(1);
    });

    it('Does not write entry in carry-over', yieldable.functioncb(function*() {
      const docs = yield carryOverDb.readCurrentMonthDocs();
      expect(docs).to.deep.equal([]);
    }));

    it('Exposes correct statistics', yieldable.functioncb(function*() {
      const response = yield fixture.bridge.readStats.withValidToken();
      expect(response.statusCode).to.equal(httpStatus.OK);
      expect(response.body.statistics.usage).to.deep.equal({
        success: {
          all: 1,
          conflicts: 1,
          notsupported: 0,
          skips: 0
        },
        failures: 0
      });
    }));
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
