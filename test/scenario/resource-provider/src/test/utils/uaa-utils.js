'use strict';

const execute = require('abacus-cmdline').execute;

const createUaaClient = (resourceId, clientSecret) => {
  try {
    execute(`uaac client get ${resourceId}`);
    console.log('Skip creating UAA client. Already exists.');
  } catch (e) {
    execute(`uaac client add ${resourceId} ` +
      `--secret ${clientSecret} ` +
      `--scope abacus.usage.${resourceId}.write,` +
      `abacus.usage.${resourceId}.read ` +
      '--authorized_grant_types client_credentials ' +
      `--authorities abacus.usage.${resourceId}.write,` +
      `abacus.usage.${resourceId}.read`,
    false);
  }
};

const removeUaaClient = (resourceId) => {
  try {
    execute(`uaac client delete ${resourceId}`);
  } catch (e) {
    if (e.stdout.toString().indexOf('CF::UAA::NotFound') !== -1) {
      console.log('Skip deleting UAA client. Not Found ...');
      return;
    }

    throw e;
  }
};

const login = (authServer, adminSecret) => {
  execute(`uaac target ${authServer} --skip-ssl-validation`);
  execute(`uaac token client get admin -s ${adminSecret}`, false);
  return {
    createUaaClient: createUaaClient,
    removeUaaClient: removeUaaClient
  };
};

module.exports = login;
