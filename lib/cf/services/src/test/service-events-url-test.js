'use strict';

const createServiceEventsURL = require('../service-events-url');

describe('service-events-url', () => {
  it('can create a default URL', () => {
    const url = createServiceEventsURL();
    expect(url).to.include('/v2/service_usage_events?');
    expect(url).to.include('order-direction=asc');
    expect(url).to.include('results-per-page=50');
    expect(url).to.include(
      'q=service_instance_type%3Amanaged_service_instance');
  });

  it('can create a URL with service guids filter', () => {
    const firstGuid = 'first-guid';
    const secondGuid = 'second-guid';
    const url = createServiceEventsURL({
      serviceGuids: [firstGuid, secondGuid]
    });
    expect(url).to.include(
      `q=service_guid%20IN%20${firstGuid}%2C${secondGuid}`);
  });

  it('can create a URL with after guid filter', () => {
    const afterGuid = 'after-this-guid';
    const url = createServiceEventsURL({
      afterGuid
    });
    expect(url).to.include(`after_guid=${afterGuid}`);
  });

  it('can create a URL with results per page filter', () => {
    const resultsPerPage = 1893;
    const url = createServiceEventsURL({
      resultsPerPage
    });
    expect(url).to.include(`results-per-page=${resultsPerPage}`);
  });
});
