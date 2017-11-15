'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const request = require('abacus-request');

const createTokenFactory = require('./utils/token-factory');
const wait = require('./utils/wait');

let fixture;
let customBefore = () => {};

const build = () => {

  context('when requesting statistics', () => {
    let externalSystemsMocks;

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

      fixture.bridge.start(externalSystemsMocks);

      wait.until(() => {
        return externalSystemsMocks.cloudController.usageEvents.requestsCount() >= 1;
      }, done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });

    context('with NO token', () => {
      it('UNAUTHORIZED is returned', (done) => {
        request.get('http://localhost::port/v1/stats', {
          port: fixture.bridge.port
        }, (error, response) => {
          console.log(error);
          expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
          done();
        });
      });
    });

    context('with token with NO required scopes', () => {
      it('FORBIDDEN is returned', (done) => {
        console.log(fixture.env.tokenSecret);
        const tokenFactory = createTokenFactory(fixture.env.tokenSecret);
        const signedToken = tokenFactory.create(['abacus.usage.invalid']);
        request.get('http://localhost::port/v1/stats', {
          port: fixture.bridge.port,
          headers: {
            authorization: `Bearer ${signedToken}`
          }
        }, (error, response) => {
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
  before: (value) => {
    customBefore = value;
    return testDef;
  },
  build
};

module.exports = testDef;

