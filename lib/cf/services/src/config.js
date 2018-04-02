'use strict';

const loadServicesFromEnvironment = () => {
  return process.env.SERVICES ? JSON.parse(process.env.SERVICES) : undefined;
};

const loadFromEnvironment = () => {
  return {
    services: loadServicesFromEnvironment()
  };
};

module.exports.loadFromEnvironment = loadFromEnvironment;
module.exports.loadServicesFromEnvironment = loadServicesFromEnvironment;
