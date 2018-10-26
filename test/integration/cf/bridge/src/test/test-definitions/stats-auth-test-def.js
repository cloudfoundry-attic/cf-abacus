'use strict';

const httpStatus = require('http-status-codes');

const { carryOverDb } = require('abacus-test-helper');

let fixture;

const build = () => {
  context('when requesting statistics', () => {
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

      await carryOverDb.setup();
      fixture.bridge.start(externalSystemsMocks);
    });

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    context('With NO token', () => {
      it('UNAUTHORIZED is returned', async () => {
        const response = await eventually(fixture.bridge.readStats.withoutToken);
        expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
      });
    });

    context('With token without required scopes', () => {
      it('FORBIDDEN is returned', async () => {
        const response = await eventually(fixture.bridge.readStats.withMissingScope);
        expect(response.statusCode).to.equal(httpStatus.FORBIDDEN);
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
