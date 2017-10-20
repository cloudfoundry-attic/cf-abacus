'use strict';

const qs = require('querystring');

const defaultResultsPerPage = 50;

const createQueries = (opts = {}) => {
  const queries = {
    'order-direction': 'asc',
    'results-per-page': opts.resultsPerPage || defaultResultsPerPage,
    'q': ['service_instance_type:managed_service_instance']
  };
  if (opts.serviceGuids && opts.serviceGuids.length > 0) {
    const filter = `service_guid IN ${opts.serviceGuids.join(',')}`;
    queries.q.push(filter);
  }
  if (opts.afterGuid)
    queries.after_guid = opts.afterGuid;
  return queries;
};

const create = (opts = {}) => {
  const query = qs.stringify(createQueries(opts));
  return `/v2/service_usage_events?${query}`;
};

module.exports = create;
