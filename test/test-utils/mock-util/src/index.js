'use-strict';

const abacusCollectorMock = require('./server-mocks/abacus-collector-mock');
const applicationsCloudControllerMock = require('./server-mocks/applications-cloud-controller-mock');
const mockServiceData = require('./server-mocks/mock-service-data');
const servicesCloudControllerMock = require('./server-mocks/services-cloud-controller-mock');
const uaaServerMock = require('./server-mocks/uaa-server-mock');
const cfServerMock = require('./server-mocks/cf-server-mock');
const externalSystems = require('./external-systems');
const serviceMock = require('./service-mock-util');

module.exports = {
  abacusCollectorMock,
  applicationsCloudControllerMock,
  mockServiceData,
  servicesCloudControllerMock,
  uaaServerMock,
  cfServerMock,
  externalSystems,
  serviceMock
};
