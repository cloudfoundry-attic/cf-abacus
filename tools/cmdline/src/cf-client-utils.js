'use strict';

/* istanbul ignore file */

const execute = require('./cmdline.js').execute;

const login = (apiEndpoint, user, password) => {
  execute(`cf api ${apiEndpoint} --skip-ssl-validation`);
  execute(`cf auth ${user} ${password}`, false);

  return {
    org: require('./cf/organization'),
    space: require('./cf/space'),
    application: require('./cf/application'),
    serviceInstance: require('./cf/service-instance')
  };
};

module.exports = login;
