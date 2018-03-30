'use-strict';

module.exports = (cfUtils) => {
  let application;

  return {
    deploy: ({ target, app }) => {
      const applicationApi = cfUtils.application(target.orgName, target.spaceName);
      applicationApi.deploy(app.name, {
        manifest: app.manifest,
        noStart: true
      });

      const orgGuid = cfUtils.org.get(target.orgName).metadata.guid;
      const spaceGuid = cfUtils.space.get(orgGuid, target.spaceName).metadata.guid;

      application = applicationApi.get(spaceGuid, app.name);

      return {
        guid: application.metadata.guid,
        spaceGuid,
        orgGuid,
        destroy: () => applicationApi.delete(app.name, true),
        start: () => applicationApi.start(app.name),
        restart: () => applicationApi.restart(app.name),
        getUrl: () => applicationApi.getUrl(application.metadata.guid, app.name)
      };
    }
  };
};
