'use strict';

const urienv = require('abacus-urienv');
const _ = require('underscore');
const filter = _.filter;
const qs = require('querystring');
const { itemIterator, pageIterator } = require('abacus-paging');

const debug = require('abacus-debug')('abacus-cf-services-guid-client');
const edebug = require('abacus-debug')('e-abacus-cf-services-guid-client');

const serviceLabelsWithMissingGuid = (services) => {
  return filter(Object.keys(services), (key) => !services[key].guid);
};

const createURL = (apiURL, servicesLabels) => {
  const queries = {
    q: `label IN ${servicesLabels.join(',')}`
  };
  const queryString = qs.stringify(queries);
  return `${apiURL}/v2/services?${queryString}`;
};

const create = (cfAdminToken, perf, statistics) => {
  const uris = urienv({
    api: 80
  });

  return {
    injectGuids: (services, cb) => {
      const servicesLabels = serviceLabelsWithMissingGuid(services);
      if (servicesLabels.length === 0) {
        cb();
        return;
      }

      const url = createURL(uris.api, servicesLabels);
      const iterator = itemIterator(pageIterator(url, cfAdminToken));

      const onService = (err, service) => {
        if (err) {
          edebug('Could not read service guids from CC due to %o.', err);
          cb(error);
          return;
        }

        if (!service) {
          debug('All service guids returned from CC are injected ...');
          cb();
          return;
        }

        debug('Got service resource: %j', service);
        services[service.entity.label].guid = service.metadata.guid;

        iterator.next(onService);
      };

      iterator.next(onService);
    }
  };
};

module.exports = create;
