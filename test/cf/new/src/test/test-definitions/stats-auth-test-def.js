'use strict';

const httpStatus = require('http-status-codes');

const yieldable = require('abacus-yieldable');

const carryOverDb = require('./utils/carry-over-db');
const serviceMock = require('./utils/service-mock-util');
const wait = require('./utils/wait');

const waitUntil = yieldable(wait.until);

let fixture;

const build = () => {

  context('when requesting statistics', () => {
    let externalSystemsMocks;

    before(yieldable.functioncb(function *() {
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

      yield carryOverDb.setup();
      fixture.bridge.start(externalSystemsMocks);

      yield waitUntil(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(1));
    }));

    after((done) => {
      fixture.bridge.stop();
      carryOverDb.teardown();
      externalSystemsMocks.stopAll(done);
    });

    context('With NO token', () => {
      it('UNAUTHORIZED is returned', (done) => {
        fixture.bridge.readStats.withoutToken((err, response) => {
          expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
          done();
        });
      });
    });

    context('With token without required scopes', () => {
      it('FORBIDDEN is returned', (done) => {
        fixture.bridge.readStats.withMissingScope((err, response) => {
          expect(response.statusCode).to.equal(httpStatus.FORBIDDEN);
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
  build
};

module.exports = testDef;

