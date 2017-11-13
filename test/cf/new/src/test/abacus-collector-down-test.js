'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const _ = require('underscore');

const request = require('abacus-request');

const wait = require('./lib/wait');
const createFixture = require('./lib/service-bridge-fixture');
const createTokenFactory = require('./lib/token-factory');

const abacusCollectorScopes = ['abacus.usage.write', 'abacus.usage.read'];
const abacusCollectorToken = 'abacus-collector-token';
const cfAdminScopes = [];
const cfAdminToken = 'cfadmin-token';

describe('service-bridge-test', () => {

  context('when abacus collector is down', () => {
    let fixture;
    let externalSystemsMocks;
    let usageEventMetadata;

    before((done) => {
      fixture = createFixture();

      externalSystemsMocks = fixture.createExternalSystemsMocks();
      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService.whenScopes(abacusCollectorScopes).return(abacusCollectorToken);
      externalSystemsMocks.uaaServer.tokenService.whenScopes(cfAdminScopes).return(cfAdminToken);

      const serviceUsageEvent = fixture
        .usageEvent()
        .get();
      usageEventMetadata = serviceUsageEvent.metadata;

      externalSystemsMocks.cloudController.serviceUsageEvents.return.firstTime([serviceUsageEvent]);
      externalSystemsMocks.cloudController.serviceUsageEvents.return.secondTime([serviceUsageEvent]);

      externalSystemsMocks.cloudController.serviceGuids.return.always({
        [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
      });

      // Event reporter (abacus-client) will retry 'fixture.defaults.env.retryCount' times to report usage to abacus.
      // After that the whole process is retried (i.e. start reading again the events)
      // Stub Abacus Collector so that it will force the bridge to retry the whole proces.
      const responses = _(fixture.defaults.env.retryCount + 1).times(() => httpStatus.BAD_GATEWAY);
      responses.push(httpStatus.CREATED);
      externalSystemsMocks.abacusCollector.collectUsageService.return.series(responses);

      fixture.bridge.start({ db: process.env.DB });

      wait.until(() => {
        return externalSystemsMocks.cloudController.serviceUsageEvents.requestsCount() >= 3;
      }, done);
    });

    after((done) => {
      async.parallel([
        fixture.bridge.stop,
        externalSystemsMocks.stopAll
      ], done);
    });

    context('verify cloud controller', () => {

      it('verify Service Usage Events service calls ', () => {
        const verifyServiceUsageEventsAfterGuid = (requestNumber, afterGuid) => {
          expect(externalSystemsMocks.cloudController
            .serviceUsageEvents
            .requests(requestNumber)
            .afterGuid).to.equal(
            afterGuid
          );
        };

        verifyServiceUsageEventsAfterGuid(0, undefined);
        verifyServiceUsageEventsAfterGuid(1, undefined);
        verifyServiceUsageEventsAfterGuid(2, usageEventMetadata.guid);
      });
    });

    context('verify abacus collector', () => {
      it('expect all requests are the same', () => {
        const verifyRequest = (requestNumber) => {
          expect(externalSystemsMocks.abacusCollector.collectUsageService.requests(requestNumber)).to.deep.equal({
            token: abacusCollectorToken,
            usage: fixture.collectorUsage(usageEventMetadata.created_at)
          });
        };

        // retryCount+1 failing requests, and one successful.
        const expecedRequestsCount = fixture.defaults.env.retryCount + 2;
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requestsCount()).to.equal(expecedRequestsCount);
        _(expecedRequestsCount).forEach((n) => verifyRequest(n));
      });

    });

    it('verify correct statistics are returned', (done) => {
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
            all: 1,
            conflicts : 0,
            skips : 0
          },
          failures : 1
        });

        done();
      });
    });

  });

});
