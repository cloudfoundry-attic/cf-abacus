'use strict';

const externalSystemsMocks = require('./external-systems');

module.exports = (createAbacusCollectorMock, createCloudControllerMock, createUAAServerMock) => {
  const bridgeExternalSystemsMocks = externalSystemsMocks({
    abacusCollectorMock: createAbacusCollectorMock,
    cloudControllerMock: createCloudControllerMock,
    uaaServerMock: createUAAServerMock
  });

  const getExternalSystemsMocks = () => ({
    abacusCollector: bridgeExternalSystemsMocks.abacusCollectorMock,
    cloudController: bridgeExternalSystemsMocks.cloudControllerMock,
    uaaServer: bridgeExternalSystemsMocks.uaaServerMock,
    startAll: bridgeExternalSystemsMocks.startAll,
    stopAll: bridgeExternalSystemsMocks.stopAll
  });

  return getExternalSystemsMocks;
};
