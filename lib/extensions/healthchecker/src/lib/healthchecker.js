'use strict';

const debug = require('abacus-debug')('abacus-healthchecker');
const edebug = require('abacus-debug')('е-abacus-healthchecker');

const refreshIntervalMs = 2000;

const isEmpty = function(obj) {
  return Object.keys(obj).length === 0;
};

module.exports = async(applicationGroups, applicationHealthClient, applicationsUrisBuilder) => {

  const getApplicationsStatuses = async(appsUris) => {
    const groupStatuses = {};
    for(let uri of appsUris) {
      const appStatus = await applicationHealthClient.getApplicationHealth(uri);
      groupStatuses[uri] = appStatus;
    }
    return groupStatuses;
  };

  const getApplicationsHealth = async() => {
    const result = {};

    try {
      await Promise.all(Object.keys(applicationGroups).map(async(groupName) => {
        const applicationsCount = applicationGroups[groupName];
        const appsUris = await applicationsUrisBuilder.buildUris(groupName, applicationsCount);
        result[groupName] = await getApplicationsStatuses(appsUris);
      }));
    } catch (e) {
      edebug('Error while getting applications health. Error: ', e);
      throw e;
    }

    return result;
  };

  let applicationsHealth = {};
  const scheduleApplicationHealthRefresh = async() => {
    setTimeout(async() => {
      debug('Refreshing applications health...');
      applicationsHealth = await getApplicationsHealth();
      debug('New applications health status: %j', applicationsHealth);
      scheduleApplicationHealthRefresh();
    }, refreshIntervalMs);
  };

  if (!isEmpty(applicationGroups)) {
    applicationsHealth = await getApplicationsHealth();
    scheduleApplicationHealthRefresh();
  }

  return {
    getSystemHealth: () => {
      return applicationsHealth;
    }
  };

};
