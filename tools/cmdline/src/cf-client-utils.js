'use strict';

/* istanbul ignore file */

const execute = require('./cmdline.js').execute;

const org = require('./cf/organization');
const space = require('./cf/space');
const application = require('./cf/application');
const serviceInstance = require('./cf/service-instance');

const target = (org, space) => execute(`cf target -o ${org} -s ${space}`);

const login = (apiEndpoint, user, password) => {
  execute(`cf api ${apiEndpoint} --skip-ssl-validation`);
  execute(`cf auth ${user} ${password}`, false);

  return {
    target,
    org,
    space,
    application,
    serviceInstance
  };
};

module.exports = login;
