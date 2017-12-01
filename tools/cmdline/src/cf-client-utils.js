'use strict';

/* istanbul ignore file */

const execute = require('./cmdline.js').execute;

const getOrgId = (orgName) =>
  execute(`cf org ${orgName} --guid`).toString().trim();

const getSpaceId = (spaceName) =>
  execute(`cf space ${spaceName} --guid`).toString().trim();

const createSpace = (org, space) =>
  execute(`cf create-space -o ${org} ${space}`);

const deployApplication = (name, options = '') =>
  execute(`cf push ${name} ${options}`);

const startApplication = (name) =>
  execute(`cf start ${name}`);

const restartApplication = (name) =>
  execute(`cf restart ${name}`);

const deleteApplication = (name, deleteRoute) =>
  execute(`cf delete -f ${deleteRoute ? '-r' : ''} ${name}`);

const createServiceInstance = (service, plan, serviceName, parameters) => {
  const cmd = `cf create-service ${service} ${plan} ${serviceName}` +
  `${ parameters ? ` -c '${parameters}'` : '' }`;
  return execute(cmd);
};

const updateServiceInstance = (serviceName, parameters) => {
  const cmd = `cf update-service ${serviceName}` +
  `${ parameters ? ` -c '${parameters}'` : '' }`;
  return execute(cmd);
};

const getServiceInstanceGuid = (serviceName) =>
  execute(`cf service ${serviceName} --guid`).toString().trim();

const getServiceStatus = (serviceName) => {
  const serviceInfo = execute(`cf service ${serviceName}`).toString().trim();
  return serviceInfo.match(new RegExp(/status: (.*)/, 'i'))[1];
};

const bindServiceInstance = (serviceName, appName) =>
  execute(`cf bind-service ${appName} ${serviceName}`).toString().trim();

const unbindServiceInstance = (serviceName, appName) =>
  execute(`cf unbind-service ${appName} ${serviceName}`).toString().trim();

const deleteServiceInstance = (serviceName) =>
  execute(`cf delete-service -f ${serviceName}`);

const target = (org, space) =>
  execute(`cf target -o ${org} -s ${space}`);

const login = (apiEndpoint, user, password) => {
  execute(`cf api ${apiEndpoint} --skip-ssl-validation`);
  execute(`cf auth ${user} ${password}`, false);
  return {
    getOrgId: getOrgId,
    getSpaceId: getSpaceId,
    deployApplication: deployApplication,
    startApplication: startApplication,
    restartApplication: restartApplication,
    deleteApplication: deleteApplication,
    createServiceInstance: createServiceInstance,
    updateServiceInstance: updateServiceInstance,
    getServiceInstanceGuid: getServiceInstanceGuid,
    getServiceStatus: getServiceStatus,
    bindServiceInstance: bindServiceInstance,
    unbindServiceInstance: unbindServiceInstance,
    deleteServiceInstance: deleteServiceInstance,
    target: target,
    createSpace: createSpace
  };
};

module.exports = login;
