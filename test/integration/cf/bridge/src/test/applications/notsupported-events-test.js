'use strict';

const httpStatus = require('http-status-codes');

const { carryOverDb } = require('abacus-test-helper');
const { serviceMock } = require('abacus-mock-util');

const applicationFixture = require('./fixture');

describe('applications-bridge not supported events tests', () => {
  const fixture = applicationFixture;

  context('when bridge sends usage documents for orgs part of not supported account licenses', () => {
    let externalSystemsMocks;

    before(async () => {
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

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(451); // Unavailable For Legal Reasons

      await carryOverDb.setup();
      fixture.bridge.start(externalSystemsMocks);

      await eventually(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(2));
    });

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    it('collector received usage', () => {
      expect(externalSystemsMocks.abacusCollector.collectUsageService.requests().length).to.equal(1);
    });

    it('does not write entry in carry-over', async () => {
      const docs = await carryOverDb.readCurrentMonthDocs();
      expect(docs).to.deep.equal([]);
    });

    it('exposes correct statistics', async () => {
      const response = await fixture.bridge.readStats.withValidToken();
      expect(response.statusCode).to.equal(httpStatus.OK);
      expect(response.body.statistics.usage).to.deep.equal({
        success: {
          all: 1,
          conflicts: 0,
          notsupported: 1,
          skips: 0
        },
        failures: 0
      });
    });
  });
});
