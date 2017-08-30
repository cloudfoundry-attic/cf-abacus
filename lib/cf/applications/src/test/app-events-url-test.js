'use strict';

const createAppEventsURL = require('../app-events-url');

describe('app-events-url', () => {
  it('can create a default URL', () => {
    const url = createAppEventsURL();
    expect(url).to.include('/v2/app_usage_events?');
    expect(url).to.include('order-direction=asc');
    expect(url).to.include('results-per-page=50');
  });

  it('can create a URL with after guid filter', () => {
    const afterGuid = 'after-this-guid';
    const url = createAppEventsURL({
      afterGuid
    });
    expect(url).to.include(`after_guid=${afterGuid}`);
  });

  it('can create a URL with results per page filter', () => {
    const resultsPerPage = 1893;
    const url = createAppEventsURL({
      resultsPerPage
    });
    expect(url).to.include(`results-per-page=${resultsPerPage}`);
  });
});
