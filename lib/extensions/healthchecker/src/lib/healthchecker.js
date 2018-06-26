'use strict';

const debug = require('abacus-debug')('abacus-healthchecker');
const edebug = require('abacus-debug')('е-abacus-healthchecker');

const isEmpty = function(obj) {
  return Object.keys(obj).length === 0;
};

module.exports = (config, applicationHealthClient, applicationsUrisBuilder) => {

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
      await Promise.all(Object.keys(config.applicationGroups).map(async(groupName) => {
        const applicationsCount = config.applicationGroups[groupName];
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

  const scheduleAppHealthRefresh = () => {
    setTimeout(async() => {
      applicationsHealth = await refreshApplicationHealth();
      scheduleAppHealthRefresh();
    }, config.refreshIntervalMs);
  };

  if (!isEmpty(config.applicationGroups))
    scheduleAppHealthRefresh();

  return {
    getSystemHealth: () => {
      return applicationsHealth;
    }
  };

};
