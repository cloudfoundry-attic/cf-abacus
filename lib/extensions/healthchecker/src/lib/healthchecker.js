'use strict';

const debug = require('abacus-debug')('abacus-healthchecker');
const edebug = require('abacus-debug')('е-abacus-healthchecker');

const { iindex } = require('abacus-vcapenv');

// Interleave health-checks between application instances
const refreshIntervalMs = () => 5000 + iindex() * 3500;

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

  const refreshApplicationHealth = async() => {
    debug('Refreshing applications health...');
    const appHealth = await getApplicationsHealth();
    debug('New applications health status: %j', appHealth);
    return appHealth;
  };

  let applicationsHealth = {};

  const scheduleAppHealthRefresh = async() => {
    applicationsHealth = await refreshApplicationHealth();
    setTimeout(scheduleAppHealthRefresh, refreshIntervalMs());
  };

  if (!isEmpty(applicationGroups))
    await scheduleAppHealthRefresh();

  return {
    getSystemHealth: () => {
      return applicationsHealth;
    }
  };

};
