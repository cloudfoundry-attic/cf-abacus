'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const serviceMock = require('./utils/service-mock-util');
const wait = require('./utils/wait');

let fixture;

const build = () => {

  context('when requesting statistics', () => {
    let externalSystemsMocks;

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

      fixture.bridge.start(externalSystemsMocks);

      wait.until(serviceMock(externalSystemsMocks.cloudController.usageEvents).received(1), done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
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

