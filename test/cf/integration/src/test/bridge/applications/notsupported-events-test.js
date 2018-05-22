'use strict';

const httpStatus = require('http-status-codes');

const yieldable = require('abacus-yieldable');

const carryOverDb = require('../../utils/carry-over-db');
const serviceMock = require('../..//utils/service-mock-util');
const createWait = require('abacus-wait');

const waitUntil = yieldable(createWait().until);

const applicationFixture = require('./fixture');

describe('applications-bridge not supported events tests', () => {
  const fixture = applicationFixture;

  context('when bridge sends usage documents for orgs part of not supported account licenses', () => {
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

        externalSystemsMocks.abacusCollector.collectUsageService.return.always(451); // Unavailable For Legal Reasons

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

    it('Abacus collector received usage for not supported account', () => {
      expect(externalSystemsMocks.abacusCollector.collectUsageService.requests().length).to.equal(1);
    });

    it(
      'Does not write entry in carry-over',
      yieldable.functioncb(function*() {
        const docs = yield carryOverDb.readCurrentMonthDocs();
        expect(docs).to.deep.equal([]);
      })
    );

    it(
      'Exposes correct statistics',
      yieldable.functioncb(function*() {
        const response = yield fixture.bridge.readStats.withValidToken();
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
      })
    );
  });
});
