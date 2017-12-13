'use strict';

/* istanbul ignore file */

const execute = require('./cmdline.js').execute;

const getOrgId = (orgName) =>
  execute(`cf org ${orgName} --guid`)
    .toString()
    .trim();

const getSpaceId = (spaceName) =>
  execute(`cf space ${spaceName} --guid`)
    .toString()
    .trim();

const createOrg = (org) =>
  execute(`cf create-org ${org}`);

const deleteOrg = (org) =>
  execute(`cf delete-org ${org} -f`);

const createSpace = (org, space) =>
  execute(`cf create-space -o ${org} ${space}`);

const deployApplication = (name, options = {}) => {
  const path = options.path ? `-p ${options.path}` : '';
  const memory = options.memory ? `-m ${options.memory}` : '';
  const buildpack = options.buildpack ? `-b ${options.buildpack}` : '';
  const manifest = options.manifest ? `-f ${options.manifest}` : '';
  const noStart = options.noStart ? '--no-start' : '';

  execute(`cf push ${name} ${path} ${memory} ${buildpack} ${manifest} ${noStart}`);
};

const startApplication = (name) => execute(`cf start ${name}`);

const restartApplication = (name) => execute(`cf restart ${name}`);

const deleteApplication = (name, deleteRoute) => execute(`cf delete -f ${deleteRoute ? '-r' : ''} ${name}`);

const createServiceInstance = (service, plan, serviceName, parameters) => {
  const cmd = `cf create-service ${service} ${plan} ${serviceName}` + (parameters ? ` -c ${parameters}` : '') ;
  return execute(cmd);
};

const updateServiceInstance = (serviceName, parameters) => {
  const cmd = `cf update-service ${serviceName}` + (parameters ? ` -c '${parameters}'` : '');
  return execute(cmd);
};

const getServiceInstanceGuid = (serviceName) =>
  execute(`cf service ${serviceName} --guid`)
    .toString()
    .trim();

const getServiceStatus = (serviceName) => {
  const serviceInfo = execute(`cf service ${serviceName}`)
    .toString()
    .trim();
  return serviceInfo.match(new RegExp(/status: (.*)/, 'i'))[1];
};

const bindServiceInstance = (serviceName, appName) =>
  execute(`cf bind-service ${appName} ${serviceName}`)
    .toString()
    .trim();

const unbindServiceInstance = (serviceName, appName) =>
  execute(`cf unbind-service ${appName} ${serviceName}`)
    .toString()
    .trim();

const deleteServiceInstance = (serviceName) => execute(`cf delete-service -f ${serviceName}`);

const target = (org, space) => execute(`cf target -o ${org} -s ${space}`);

const login = (apiEndpoint, user, password) => {
  execute(`cf api ${apiEndpoint} --skip-ssl-validation`);
  execute(`cf auth ${user} ${password}`, false);
  return {
    getOrgId,
    getSpaceId,
    deployApplication,
    startApplication,
    restartApplication,
    deleteApplication,
    createServiceInstance,
    updateServiceInstance,
    getServiceInstanceGuid,
    getServiceStatus,
    bindServiceInstance,
    unbindServiceInstance,
    deleteServiceInstance,
    target,
    createSpace,
    createOrg,
    deleteOrg
  };
};

module.exports = login;
