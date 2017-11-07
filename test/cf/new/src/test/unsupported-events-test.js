'use strict';

const async = require('async');
const extend = require('underscore').extend;
const httpStatus = require('http-status-codes');

const request = require('abacus-request');

const createFixture = require('./lib/service-bridge-fixture');
const createTokenFactory = require('./lib/token-factory');
const wait = require('./lib/wait');

const abacusCollectorToken = 'abacus-collector-token';
const cfAdminToken = 'cfadmin-token';

describe('service-bridge-test', () => {

  context('when reading unsupported events from cloud controller', () => {
    let fixture;
    let externalSystemsMocks;

    before((done) => {
      fixture = createFixture();
      externalSystemsMocks = fixture.createExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService.forAbacusCollectorToken.return.always(abacusCollectorToken);
      externalSystemsMocks.uaaServer.tokenService.forCfAdminToken.return.always(cfAdminToken);

      const unsupportedOrganzationUsageEvent = fixture
        .usageEvent()
        .overwriteOrgGuid('unsupported')
        .get();
      const unsupportedStateUsageEvent = fixture
        .usageEvent()
        .overwriteState('UNSUPPORTED')
        .get();
      const unsupportedServiceUsageEvent = fixture
        .usageEvent()
        .overwriteServiceLabel('unsupported-service')
        .get();
      const unsupportedServicePlanUsageEvent = fixture
        .usageEvent()
        .overwriteServicePlanName('unsupported-service-plan')
        .get();

      externalSystemsMocks.cloudController.serviceUsageEvents.return.firstTime([
        unsupportedOrganzationUsageEvent,
        unsupportedServicePlanUsageEvent,
        unsupportedServiceUsageEvent,
        unsupportedStateUsageEvent
      ]);
      externalSystemsMocks.cloudController.serviceGuids.return.always({
        [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
      });

      // fixture.setEnviornmentVars();

      extend(process.env, fixture.customEnviornmentVars());

      fixture.bridge.start({ db: process.env.DB });


      wait.until(() => {
        // TODO: check if we could wait abacus to recieve a single usage
        return externalSystemsMocks.cloudController.serviceUsageEvents.requestsCount() >= 2;
      }, done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });


    it('expect abacus collector receive NO usage', () => {
      expect(externalSystemsMocks.abacusCollector.collectUsageService.requestsCount()).to.equal(0);
    });

    it('expect correct statistics are returned', (done) => {
      const tokenFactory = createTokenFactory(fixture.defaults.oauth.tokenSecret);
      const signedToken = tokenFactory.create(['abacus.usage.read']);
      request.get('http://localhost:9502/v1/stats', {
        port: 9502,
        headers: {
          authorization: `Bearer ${signedToken}`
        }
      }, (error, response) => {
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(response.body.statistics.usage).to.deep.equal({
          success : {
            all: 4,
            conflicts: 0,
            skips: 4
          },
          failures : 0
        });
        done();
      });
    });

  });

});
