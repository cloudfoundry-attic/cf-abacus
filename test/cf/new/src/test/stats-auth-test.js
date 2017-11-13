'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');

const request = require('abacus-request');

const wait = require('./lib/wait');
const createFixture = require('./lib/service-bridge-fixture');
const createTokenFactory = require('./lib/token-factory');

const abacusCollectorToken = 'abacus-collector-token';
const cfAdminToken = 'cfadmin-token';

describe('service-bridge-test/stats endpoint', () => {

  context('when requesting statistics', () => {
    let fixture;
    let externalSystemsMocks;

    before((done) => {
      fixture = createFixture();
      
      externalSystemsMocks = fixture.createExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService.forAbacusCollectorToken.return.always(abacusCollectorToken);
      externalSystemsMocks.uaaServer.tokenService.forCfAdminToken.return.always(cfAdminToken);

      externalSystemsMocks.cloudController.serviceGuids.return.always({
        [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
      });

      fixture.bridge.start({ db: process.env.DB });

      wait.until(() => {
        return externalSystemsMocks.cloudController.serviceUsageEvents.requestsCount() >= 1;
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
        const tokenFactory = createTokenFactory(fixture.defaults.oauth.tokenSecret);
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
});
