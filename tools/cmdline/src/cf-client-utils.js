'use strict';

/* istanbul ignore file */

const execute = require('./cmdline.js').execute;

const org = {
  getId: (orgName) => execute(`cf org ${orgName} --guid`)
    .toString()
    .trim(),
  create: (org) => execute(`cf create-org ${org}`),
  delete:  (org) => execute(`cf delete-org ${org} -f`)
};

const space = {
  getId: (spaceName) => execute(`cf space ${spaceName} --guid`)
    .toString()
    .trim(),
  create: (org, space) => execute(`cf create-space -o ${org} ${space}`)
};

const deployApplication = (name, options = {}) => {
  const path = options.path ? `-p ${options.path}` : '';
  const memory = options.memory ? `-m ${options.memory}` : '';
  const buildpack = options.buildpack ? `-b ${options.buildpack}` : '';
  const manifest = options.manifest ? `-f ${options.manifest}` : '';
  const noStart = options.noStart ? '--no-start' : '';

  execute(`cf push ${name} ${path} ${memory} ${buildpack} ${manifest} ${noStart}`);
};

const application = {
  deploy: deployApplication,
  start: (name) => execute(`cf start ${name}`),
  restart: (name) => execute(`cf restart ${name}`),
  delete: (name, deleteRoute) => execute(`cf delete -f ${deleteRoute ? '-r' : ''} ${name}`)
};

const getServiceStatus = (serviceName) => {
  const serviceInfo = execute(`cf service ${serviceName}`).toString().trim();
  const status = serviceInfo.match(new RegExp(/status: (.*)/, 'i'))[1];
  return status.trim();
};

const serviceInstance = {
  getId:  (serviceName) => execute(`cf service ${serviceName} --guid`).toString().trim(),
  getStatus: getServiceStatus,
  create: (service, plan, serviceName, parameters) =>
    execute(`cf create-service ${service} ${plan} ${serviceName}` + (parameters ? ` -c '${parameters}'` : '')),
  update: (serviceName, parameters) =>
    execute(`cf update-service ${serviceName}` + (parameters ? ` -c '${parameters}'` : '')),
  delete: (serviceName) => execute(`cf delete-service -f ${serviceName}`),
  bind: (serviceName, appName) => execute(`cf bind-service ${appName} ${serviceName}`).toString().trim(),
  unbind: (serviceName, appName) => execute(`cf unbind-service ${appName} ${serviceName}`).toString().trim()
};

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
