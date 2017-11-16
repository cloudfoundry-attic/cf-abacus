'use strict';

const _ = require('underscore');
const isEqual = _.isEqual;

const happyTestsDefinition = require('./test-definitions/happy-path-test-def');
const servicesFixture = require('./fixtures/service-bridge-fixture');

const tests = (fixture) => {

  return context('verify Cloud Controller', () => {

    it('verify Service Usage Events recieved correct service guids ', () => {
      const cloudControllerMock = fixture.getExternalSystemsMocks().cloudController;

      const expectedGuids = [fixture.defaultUsageEvent.serviceGuid];
      const requests = cloudControllerMock.usageEvents.requests();
      const unmatching = requests.filter((request) => !isEqual(request.serviceGuids, expectedGuids));
      expect(unmatching).to.deep.equal([]);
    });

    it('verify Services service calls', () => {
      const cloudControllerMock = fixture.getExternalSystemsMocks().cloudController;

      // Expect 2 calls as configuration is load by both Master and Worker process
      const expectedRequests = _(2).times(() => ({
        token: fixture.oauth.cfAdminToken,
        serviceLabels: [fixture.defaultUsageEvent.serviceLabel]
      }));
      expect(cloudControllerMock.serviceGuids.requests()).to.deep.equal(expectedRequests);
    });

  });
};

describe('services-bridge happy path tests', () => {

  before(() => {
    servicesFixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
      [servicesFixture.defaultUsageEvent.serviceLabel]: servicesFixture.defaultUsageEvent.serviceGuid
    });
  });

  happyTestsDefinition
    .fixture(servicesFixture)
    .customTests(tests)
    .build();

});

