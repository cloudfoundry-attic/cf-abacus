'use strict';

const yaml = require('js-yaml');

const buildAppName = (prefix, name) => {
  return prefix ? prefix + name : name;
};

const verifyManifest = (manifest) => {
  if (!manifest.applications)
    throw new Error('Invalid application manifest yaml. No applications.',
    manifest);

  if (!manifest.applications[0].path)
    throw new Error('Invalid application manifest yaml. No path.', manifest);
};

const adjustOptionalProperties = (application, properties) => {
  if (properties.instances)
    application.instances = parseInt(properties.instances);

  if (properties.buildpack)
    application.buildpack = properties.buildpack;

  if (properties.conf) {
    if (!application.env) application.env = {};
    application.env.CONF = properties.conf;
  }
};

const adjustManifest = (manifest, properties) => {
  const parsedManifest = yaml.load(manifest);

  verifyManifest(parsedManifest);

  if (!properties || Object.keys(properties).length == 0)
    return manifest;

  const app = parsedManifest.applications[0];
  const appName = buildAppName(properties.prefix, properties.name);

  app.name = appName;
  app.host = appName;
  app.path = '../' + app.path;

  adjustOptionalProperties(app, properties);

  return yaml.dump(parsedManifest);
};

module.exports.adjustManifest = adjustManifest;
