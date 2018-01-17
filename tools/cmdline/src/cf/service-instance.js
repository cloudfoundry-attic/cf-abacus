'use strict';
/* istanbul ignore file */

const cfCurl = require('./cf-curl');

module.exports = {
  get: (guid) => cfCurl.get(`/v2/service_instances/${guid}`),
  create: (instanceName, serviceName, planName, spaceGuid, parameters) => {
    const service = cfCurl.getSingleResult(`/v2/services?q=label:${serviceName}`);
    const plansResponse = cfCurl.get(`/v2/services/${service.metadata.guid}/service_plans`);
    const plan = plansResponse.resources.filter((plan) => plan.entity.name === planName)[0];

    if (!plan)
      throw new Error(`Cannot find plan '${planName}' for service '${serviceName}'.`);

    return cfCurl.post('/v2/service_instances', {
      name: instanceName,
      service_plan_guid: plan.metadata.guid,
      space_guid: spaceGuid,
      parameters
    });
  },
  update: (serviceInstanceGuid, parameters) => cfCurl.put(`/v2/service_instances/${serviceInstanceGuid}`, parameters),
  delete: (serviceInstanceGuid) => cfCurl.delete(`/v2/service_instances/${serviceInstanceGuid}?recursive=true`),
  bind: (serviceInstanceGuid, appGuid) => cfCurl.post('/v2/service_bindings', {
    service_instance_guid: serviceInstanceGuid,
    app_guid: appGuid
  })
};
