'use strict';

const fs = require('fs');
const _ = require('underscore');
const httpStatus = require('http-status-codes');

const yieldable = require('abacus-yieldable');

const { carryOverDb } = require('abacus-test-helper');

describe('services-bridge UPDATED event tests', () => {
  const fixture = require('./fixture');

  const contextSetup = {
    fixture,
    init: () => {
      let externalSystemsMocks = fixture.externalSystemsMocks();

      externalSystemsMocks.cloudController.serviceGuids.return.always({
        [fixture.defaultUsageEvent.serviceLabel]: fixture.defaultUsageEvent.serviceGuid
      });

      externalSystemsMocks.startAll();

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.oauth.abacusCollectorScopes)
        .return(fixture.oauth.abacusCollectorToken);

      externalSystemsMocks.uaaServer.tokenService
        .whenScopesAre(fixture.oauth.cfAdminScopes)
        .return(fixture.oauth.cfAdminToken);
    },
    finalizeSetup: function*() {
      yield carryOverDb.setup();
      fixture.bridge.start(fixture.externalSystemsMocks());
    },
    cleanUp: (cb) => {
      const clearMocks = () => {
        fixture.externalSystemsMocks().cloudController.usageEvents.clear();
        fixture.externalSystemsMocks().cloudController.usageEvents.return.nothing();

        fixture.externalSystemsMocks().abacusCollector.collectUsageService.clear();
        fixture.externalSystemsMocks().abacusCollector.collectUsageService.return.nothing();

        cb();
      };
      fixture.bridge.stop();
      carryOverDb.teardown();
      fixture.externalSystemsMocks().stopAll(clearMocks);
    }
  };

  const collectUsageServiceTest = (numRequests, expectedUsageDocs) => {
    it(`Collect Usage Service is called ${numRequests} times ${numRequests ? 'with correct args' : ''}`, () => {
      const verifyCollectUsageServiceCall = (requestNumber) =>
        expect(fixture.externalSystemsMocks().abacusCollector.collectUsageService.request(requestNumber))
          .to.deep.equal({
            token: fixture.oauth.abacusCollectorToken,
            usage: expectedUsageDocs[requestNumber]
          });

      expect(fixture.externalSystemsMocks().abacusCollector.collectUsageService.requests().length)
        .to.equal(numRequests);
      _(numRequests).times((requestNumber) => verifyCollectUsageServiceCall(requestNumber));
    });
  };

  const usageEventsServiceTest = (numRequests, expectedGuids) => {
    it(`Usage Events Service receive ${numRequests} requests with correct args`, () => {
      const verifyServiceUsageEventsAfterGuid = (requestNumber, afterGuid) =>
        expect(fixture.externalSystemsMocks().cloudController.usageEvents.request(requestNumber).afterGuid)
          .to.equal(afterGuid);

      _(numRequests).times((i) => verifyServiceUsageEventsAfterGuid(i, expectedGuids[i]));
    });
  };

  const statisticsTest = (expectedStatistics) => {
    it('Exposes correct statistics', yieldable.functioncb(function*() {
      const response = yield fixture.bridge.readStats.withValidToken();

      expect(response.statusCode).to.equal(httpStatus.OK);
      expect(response.body.statistics.usage).to.deep.equal(expectedStatistics);
    }));
  };

  const carryOverTest = (numEntries, expected) => {
    it(`Writes ${numEntries}${numEntries ? ' correct' : ''} entr${numEntries === 1 ? 'y' : 'ies'} in carry over`,
      yieldable.functioncb(function*() {
        const docs = yield carryOverDb.readCurrentMonthDocs();
        expect(docs.length).to.be.equal(numEntries);

        _(numEntries).times((i) => {
          expect(docs[i]).to.have.property('event_guid', expected[i].guid);
          expect(docs[i]).to.have.property('state', expected[i].state);
        });
      }));
  };

  const tests = {
    collectUsageService: collectUsageServiceTest,
    usageEventsService: usageEventsServiceTest,
    statistics: statisticsTest,
    carryOver: carryOverTest
  };

  const testContextFilesPath = `${__dirname}/update-event-test-contexts`;

  const testContextFiles = fs
    .readdirSync(testContextFilesPath)
    .filter((fileName) => fileName.includes('-test-context'));

  testContextFiles.forEach((testContextFile) => {
    const testContext = require(`${testContextFilesPath}/${testContextFile}`);
    testContext
      .arrange(contextSetup)
      .run(tests);
  });
});
