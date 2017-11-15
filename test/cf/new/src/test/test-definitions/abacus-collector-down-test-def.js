'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const _ = require('underscore');

const request = require('abacus-request');

const wait = require('./utils/wait');
const createTokenFactory = require('./utils/token-factory');

let fixture;
let customBefore = () => {};

const build = () => {

  context('when abacus collector is down', () => {
    let externalSystemsMocks;
    let usageEventMetadata;

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

      const serviceUsageEvent = fixture
        .usageEvent()
        .get();
      usageEventMetadata = serviceUsageEvent.metadata;

      externalSystemsMocks.cloudController.usageEvents.return.firstTime([serviceUsageEvent]);
      externalSystemsMocks.cloudController.usageEvents.return.secondTime([serviceUsageEvent]);

      // Event reporter (abacus-client) will retry 'fixture.env.retryCount' times to report usage to abacus.
      // After that the whole process is retried (i.e. start reading again the events)
      // Stub Abacus Collector so that it will force the bridge to retry the whole proces.
      const responses = _(fixture.env.retryCount + 1).times(() => httpStatus.BAD_GATEWAY);
      responses.push(httpStatus.CREATED);
      externalSystemsMocks.abacusCollector.collectUsageService.return.series(responses);

      fixture.bridge.start(externalSystemsMocks);

      wait.until(() => {
        return externalSystemsMocks.cloudController.usageEvents.requestsCount() >= 3;
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
            .usageEvents
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
            token: fixture.oauth.abacusCollectorToken,
            usage: fixture.collectorUsage(usageEventMetadata.created_at)
          });
        };

        // retryCount+1 failing requests, and one successful.
        const expecedRequestsCount = fixture.env.retryCount + 2;
        expect(externalSystemsMocks.abacusCollector.collectUsageService.requestsCount()).to.equal(expecedRequestsCount);
        _(expecedRequestsCount).forEach((n) => verifyRequest(n));
      });

    });

    it('verify correct statistics are returned', (done) => {
      const tokenFactory = createTokenFactory(fixture.env.tokenSecret);
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
