'use strict';

const _ = require('underscore');
const filter = _.filter;
const qs = require('querystring');
const paging = require('abacus-paging');

const debug = require('abacus-debug')('abacus-cf-services-guid-client');
const edebug = require('abacus-debug')('e-abacus-cf-services-guid-client');

const serviceLabelsWithMissingGuid = (services) => {
  return filter(Object.keys(services), (key) => !services[key].guid);
};

const createURL = (apiUrl, servicesLabels) => {
  const queries = {
    q: `label IN ${servicesLabels.join(',')}`
  };
  const queryString = qs.stringify(queries);
  return `${apiUrl}/v2/services?${queryString}`;
};

const create = (apiUrl, cfAdminToken) => {
  const { itemIterator, pageIterator } = paging;

  return {
    injectGuids: (services, cb) => {
      const servicesLabels = serviceLabelsWithMissingGuid(services);
      if (servicesLabels.length === 0) {
        cb();
        return;
      }

      const url = createURL(apiUrl, servicesLabels);
      const iterator = itemIterator(pageIterator(url, cfAdminToken));

      const onService = (err, service) => {
        if (err) {
          edebug('Could not read service guids from CC due to %o.', err);
          cb(err);
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
