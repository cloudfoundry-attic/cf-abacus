'use strict';

const refreshInterval = 1000;

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

    await Promise.all(Object.keys(applicationGroups).map(async(groupName) => {
      const appsUris = applicationsUrisBuilder.buildUris(groupName, applicationGroups[groupName]);
      result[groupName] = await getApplicationsStatuses(appsUris);
    }));

    return result;
  };

  let applicationsHealth = {};
  const scheduleApplicationHealthRefresh = async() => {
    setTimeout(async() => {
      applicationsHealth = await getApplicationsHealth();
      scheduleApplicationHealthRefresh();
    }, refreshInterval);
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
