'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const yieldable = require('abacus-yieldable');

const moment = require('abacus-moment');
const request = require('abacus-request');

const carryOverDb = require('./lib/carry-over-db');
const createFixture = require('./lib/service-bridge-fixture');
const createTokenFactory = require('./lib/token-factory');
const wait = require('./lib/wait');

const abacusCollectorScopes = ['abacus.usage.write', 'abacus.usage.read'];
const abacusCollectorToken = 'abacus-collector-token';
const cfAdminScopes = [];
const cfAdminToken = 'cfadmin-token';

describe('service-bridge-test', () => {

  context('when reading unhandleable events from Cloud Controller', () => {
    let fixture;
    let externalSystemsMocks;

    before((done) => {
      fixture = createFixture();
      externalSystemsMocks = fixture.createExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService.whenScopes(abacusCollectorScopes).return(abacusCollectorToken);
      externalSystemsMocks.uaaServer.tokenService.whenScopes(cfAdminScopes).return(cfAdminToken);

      const unsupportedOrganzationUsageEvent = fixture
        .usageEvent()
        .overwriteOrgGuid('unsupported')
        .get();
      const unsupportedStateUsageEvent = fixture
        .usageEvent()
        .overwriteState('UPDATE')
        .get();
      const unsupportedServiceUsageEvent = fixture
        .usageEvent()
        .overwriteServiceLabel('unsupported-service')
        .get();
      const unsupportedServicePlanUsageEvent = fixture
        .usageEvent()
        .overwriteServicePlanName('unsupported-service-plan')
        .get();

      const now = moment.now();
      const tooYoungUsageEvent = fixture
        .usageEvent()
        .overwriteCreatedAt(moment
          .utc(now)
          .subtract(fixture.defaults.minimalAgeInMinutes / 2, 'minutes')
          .valueOf())
        .get();

      externalSystemsMocks.cloudController.serviceUsageEvents.return.firstTime([
        unsupportedOrganzationUsageEvent,
        unsupportedServicePlanUsageEvent,
        unsupportedServiceUsageEvent,
        unsupportedStateUsageEvent,
        tooYoungUsageEvent
      ]);
      externalSystemsMocks.cloudController.serviceGuids.return.always({
        [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
      });

      externalSystemsMocks.abacusCollector.collectUsageService.return.always(httpStatus.CREATED);

      fixture.bridge.start({ db: process.env.DB });

      wait.until(() => {
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

    it('expect carry-over is empty', (done) => yieldable.functioncb(function *() {
      const docs = yield carryOverDb.readCurrentMonthDocs();
      expect(docs).to.deep.equal([]);
    })((err) => {
      done(err);
    }));

    it('expect skipped statistics are returned', (done) => {
      const tokenFactory = createTokenFactory(fixture.defaults.oauth.tokenSecret);
      const signedToken = tokenFactory.create(['abacus.usage.read']);
      request.get('http://localhost::port/v1/stats', {
        port: fixture.bridge.port,
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
