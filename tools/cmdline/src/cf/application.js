'use strict';
/* istanbul ignore file */

const cfCurl = require('./cf-curl');
const execute = require('../cmdline.js').execute;

const deployApplication = (name, options = {}) => {
  const path = options.path ? `-p ${options.path}` : '';
  const memory = options.memory ? `-m ${options.memory}` : '';
  const buildpack = options.buildpack ? `-b ${options.buildpack}` : '';
  const manifest = options.manifest ? `-f ${options.manifest}` : '';
  const noStart = options.noStart ? '--no-start' : '';

  execute(`cf push ${name} ${path} ${memory} ${buildpack} ${manifest} ${noStart}`);
};

module.exports = {
  get: (spaceGuid, appName) => cfCurl.getSingleResult(`/v2/spaces/${spaceGuid}/apps?q=name:${appName}`),
  deploy: deployApplication,
  start: (name) => execute(`cf start ${name}`),
  restart: (name) => execute(`cf restart ${name}`),
  delete: (name, deleteRoute) => execute(`cf delete -f ${deleteRoute ? '-r' : ''} ${name}`)
};
