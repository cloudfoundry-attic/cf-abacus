'use strict';

const loadServicesFromEnvironment = () => {
  return process.env.SERVICES ? JSON.parse(process.env.SERVICES) : undefined;
};

const loadPageSizeFromEnvironment = () => {
  return process.env.PAGE_SIZE || 100;
};

const loadFromEnvironment = () => {
  return {
    services: loadServicesFromEnvironment(),
    pageSize: loadPageSizeFromEnvironment()
  };
};

module.exports.loadFromEnvironment = loadFromEnvironment;
module.exports.loadServicesFromEnvironment = loadServicesFromEnvironment;
