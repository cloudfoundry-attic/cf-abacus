'use strict';

const { isEmpty, flatten } = require('underscore');
const debug = require('abacus-debug')('abacus-cf-service-guids-extractor');

const extractGuids = (services) => {
  debug('Services: %j', services);
  let guids = [];
  if (!isEmpty(services))
    guids = flatten(Object.keys(services).map((key) => services[key].guids)).filter((guid) => guid);
  debug('Extracted service guids: %j', guids);
  return guids;
};

module.exports.extractGuids = extractGuids;
