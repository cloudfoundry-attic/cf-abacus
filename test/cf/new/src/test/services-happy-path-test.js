'use strict';

const happyTestsDefinition = require('./test-definitions/happy-path-test-def');
const servicesFixture = require('./lib/service-bridge-fixture');

const stubCloudControllerServices = (fixture) => {
  fixture.getExternalSystemsMocks().cloudController.serviceGuids.return.always({
    [fixture.defaults.usageEvent.serviceLabel]: fixture.defaults.usageEvent.serviceGuid
  });
};

const tests = (fixture) => {

  return context('verify Cloud Controller', () => {

    it('verify Service Usage Events recieved correct service guids ', () => {
      const cloudControllerMock = fixture.getExternalSystemsMocks().cloudController;

      // FIXME: refactor -> expect(requests()).to.hava.all(serviceGuids: [..])
      expect(cloudControllerMock.usageEvents.requests(0).serviceGuids).to.deep.equal(
        [fixture.defaults.usageEvent.serviceGuid]
      );
      expect(cloudControllerMock.usageEvents.requests(1).serviceGuids).to.deep.equal(
        [fixture.defaults.usageEvent.serviceGuid]
      );
      expect(cloudControllerMock.usageEvents.requests(2).serviceGuids).to.deep.equal(
        [fixture.defaults.usageEvent.serviceGuid]
      );
      expect(cloudControllerMock.usageEvents.requests(3).serviceGuids).to.deep.equal(
        [fixture.defaults.usageEvent.serviceGuid]
      );
    });

    it('verify Services service calls', () => {
      const cloudControllerMock = fixture.getExternalSystemsMocks().cloudController;

      // Expect 2 calls as configuration is load by both Master and Worker process
      expect(cloudControllerMock.serviceGuids.requestsCount()).to.equal(2);
      expect(cloudControllerMock.serviceGuids.requests(0)).to.deep.equal({
        token: fixture.defaults.oauth.cfAdminToken,
        serviceLabels: [fixture.defaults.usageEvent.serviceLabel]
      });
      expect(cloudControllerMock.serviceGuids.requests(1)).to.deep.equal({
        token: fixture.defaults.oauth.cfAdminToken,
        serviceLabels: [fixture.defaults.usageEvent.serviceLabel]
      });
    });

  });
};

describe('services-bridge happy path tests', () => {

  happyTestsDefinition
    .fixture(servicesFixture)
    .before(stubCloudControllerServices)
    .customTests(tests)
    .build();

});

