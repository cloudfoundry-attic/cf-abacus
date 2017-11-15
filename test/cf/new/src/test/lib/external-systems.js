'use strict';

const async = require('async');

module.exports = (createAbacusCollectorMock, createCloudControllerMock, createUAAServerMock) => {
  let abacusCollectorMock;
  let cloudControllerMock;
  let uaaServerMock;

  let externalSystemsMocks;

  const getExternalSystemsMocks = () => {
    if (externalSystemsMocks)
      return externalSystemsMocks;


    abacusCollectorMock = createAbacusCollectorMock();
    cloudControllerMock = createCloudControllerMock();
    uaaServerMock = createUAAServerMock();

    externalSystemsMocks = {
      abacusCollector: abacusCollectorMock,
      cloudController: cloudControllerMock,
      uaaServer: uaaServerMock,
      startAll: () => {
        abacusCollectorMock.start();
        cloudControllerMock.start();
        uaaServerMock.start();
      },
      stopAll: (done) => {
        async.parallel([
          abacusCollectorMock.stop,
          cloudControllerMock.stop,
          uaaServerMock.stop
        ], done);
      }
    };

    return externalSystemsMocks;
  };

  return getExternalSystemsMocks;
};
