'use strict';

const qs = require('querystring');
const urienv = require('abacus-urienv');

const defaultResultsPerPage = 50;

const createQueries = (opts = {}) => {
  const queries = {
    'order-direction': 'asc',
    'results-per-page': opts.resultsPerPage || defaultResultsPerPage
  };
  if (opts.afterGuid) queries.after_guid = opts.afterGuid;
  return queries;
};

const create = (opts = {}) => {
  const uris = urienv({
    api: 80
  });
  const query = qs.stringify(createQueries(opts));
  return `${uris.api}/v2/app_usage_events?${query}`;
};

module.exports = create;
