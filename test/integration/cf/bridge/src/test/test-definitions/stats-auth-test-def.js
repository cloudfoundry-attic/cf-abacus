'use strict';

const httpStatus = require('http-status-codes');

const yieldable = require('abacus-yieldable');
const createWait = require('abacus-wait');

const { carryOverDb } = require('abacus-test-helper');

const waitUntil = yieldable(createWait().until);

let fixture;

const build = () => {
  context('when requesting statistics', () => {
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

        yield carryOverDb.setup();
        fixture.bridge.start(externalSystemsMocks);

        yield waitUntil(fixture.bridge.readStats.isEndpointAvailable);
      })
    );

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    context('With NO token', () => {
      it('UNAUTHORIZED is returned', yieldable.functioncb(function*() {
        const response = yield fixture.bridge.readStats.withoutToken();
        expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
      })
      );
    });

    context('With token without required scopes', () => {
      it('FORBIDDEN is returned', yieldable.functioncb(function*() {
        const response = yield fixture.bridge.readStats.withMissingScope();
        expect(response.statusCode).to.equal(httpStatus.FORBIDDEN);
      }));
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
