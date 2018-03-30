'use strict';
/* istanbul ignore file */

const cfCurl = require('./cf-curl');
const execute = require('../cmdline.js').execute;

const target = (org, space) => execute(`cf target -o ${org} -s ${space}`);

const deploy = (name, options = {}) => {
  const path = options.path ? `-p ${options.path}` : '';
  const memory = options.memory ? `-m ${options.memory}` : '';
  const buildpack = options.buildpack ? `-b ${options.buildpack}` : '';
  const manifest = options.manifest ? `-f ${options.manifest}` : '';
  const noStart = options.noStart ? '--no-start' : '';

  execute(`cf push ${name} ${path} ${memory} ${buildpack} ${manifest} ${noStart}`);
};

const getUrl = (appGuid, appName) => {
  const route = cfCurl.getSingleResult(`/v2/apps/${appGuid}/routes`);
  const domain = cfCurl.get(`/v2/shared_domains/${route.entity.domain_guid}`)
  return `https://${appName}.${domain.entity.name}`;
};

module.exports = (targetOrg, targetSpace) => {
  target(targetOrg, targetSpace);
  return {
    get: (spaceGuid, appName) => cfCurl.getSingleResult(`/v2/spaces/${spaceGuid}/apps?q=name:${appName}`),
    getUrl,
    deploy,
    start: (name) => execute(`cf start ${name}`),
    restart: (name) => execute(`cf restart ${name}`),
    delete: (name, deleteRoute) => execute(`cf delete -f ${deleteRoute ? '-r' : ''} ${name}`)
  };
};
