'use strict';

const qs = require('querystring');

const defaultResultsPerPage = 50;

const createQueries = (opts = {}) => {
  const queries = {
    'order-direction': 'asc',
    'results-per-page': opts.resultsPerPage || defaultResultsPerPage
  };
  if (opts.afterGuid)
    queries.after_guid = opts.afterGuid;
  return queries;
};

const create = (opts = {}) => {
  const query = qs.stringify(createQueries(opts));
  return `/v2/app_usage_events?${query}`;
};

module.exports = create;
