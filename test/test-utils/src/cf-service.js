'use-strict';

module.exports = (cfUtils) => {
  let serviceInstance;

  return {
    createInstance: ({ spaceGuid, instanceName, service, parameters }) => {

      serviceInstance = cfUtils.serviceInstance.create(
        instanceName,
        service.name,
        service.plan,
        spaceGuid,
        parameters);

      if (serviceInstance.entity.last_operation.state != 'succeeded')
        throw new Error('Error while trying to create service instance. Response: ', JSON.stringify(serviceInstance));

      const update = (parameters) => cfUtils.serviceInstance.update(serviceInstance.metadata.guid, parameters);
      const bind = (appGuid) => cfUtils.serviceInstance.bind(serviceInstance.metadata.guid, appGuid);
      const destroy = () => cfUtils.serviceInstance.delete(serviceInstance.metadata.guid);

      return {
        update,
        bind,
        destroy
      };
    }
  };
};
