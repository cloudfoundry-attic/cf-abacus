'use strict';

const fs = require('fs');
const _ = require('underscore');
const httpStatus = require('http-status-codes');

const yieldable = require('abacus-yieldable');

const carryOverDb = require('../../utils/carry-over-db');

const initialize = (fixture) => {
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
};

const customSetup = (setup, fixture) => {
  setup(fixture);
};

const finalize = function*(waitLogic, fixture) {
  yield carryOverDb.setup();
  fixture.bridge.start(fixture.externalSystemsMocks());

  yield waitLogic(fixture);
};

const setup =  {
  prepareCommonSetup: (fixture) => {
    initialize(fixture);
  },
  prepareCustomSetup: (testDefSetup, fixture) => {
    customSetup(testDefSetup, fixture);
  },
  finalizeTestSetup: function*(waitLogic, fixture) {
    yield finalize(waitLogic, fixture);
  }
};

const cleanUp = (fixture, cb) => {
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
};

const collectUsageServiceTest = (fixture, numberOfRequests, expectedUsageDocs) => {
  it(`Collect Usage Service is called ${numberOfRequests} times ${numberOfRequests ? 'with correct args' : ''}`, () => {  
    const verifyCollectUsageServiceCall = (requestNumber) => 
      expect(fixture.externalSystemsMocks().abacusCollector.collectUsageService.request(requestNumber))
        .to.deep.equal({
          token: fixture.oauth.abacusCollectorToken,
          usage: expectedUsageDocs[requestNumber]
        });

    expect(fixture.externalSystemsMocks().abacusCollector.collectUsageService.requests().length)
      .to.equal(numberOfRequests);
    
    _(numberOfRequests).times((requestNumber) => verifyCollectUsageServiceCall(requestNumber));
  });
};

const usageEventsServiceTest = (fixture, numberOfRequests, expectedGuids) => {
  it(`Usage Events Service receive ${numberOfRequests} requests with correct args`, () => {
    const verifyServiceUsageEventsAfterGuid = (requestNumber, afterGuid) => 
      expect(fixture.externalSystemsMocks().cloudController.usageEvents.request(requestNumber).afterGuid)
        .to.equal(afterGuid);

    _(numberOfRequests).times((i) => verifyServiceUsageEventsAfterGuid(i, expectedGuids[i]));
  });
};

const statisticsTest = (fixture, expectedStatistics) => {
  it('Exposes correct statistics', yieldable.functioncb(function*() {
    const response = yield fixture.bridge.readStats.withValidToken();

    expect(response.statusCode).to.equal(httpStatus.OK);
    expect(response.body.statistics.usage).to.deep.equal(expectedStatistics);
  }));
};

const tests = {
  collectUsageService: collectUsageServiceTest,
  usageEventsService: usageEventsServiceTest,
  statistics: statisticsTest
};

describe('services-bridge UPDATED event tests', () => {
  const testContextFilesPath = `${__dirname}/update-event-test-contexts`;
  
  const testContextFiles = fs
    .readdirSync(testContextFilesPath)
    .filter(fileName => fileName.includes('-test-context'));
  
  const fixture = require('./fixture');
  testContextFiles.forEach(testContextFile => {
    const testContext = require(`${testContextFilesPath}/${testContextFile}`);
    testContext
      .fixture(fixture)
      .setup(setup)
      .commonTests(tests)
      .cleanUp(cleanUp)
      .run();
    });
});
