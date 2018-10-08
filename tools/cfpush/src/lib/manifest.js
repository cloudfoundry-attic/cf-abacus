'use strict';

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

const { originalManifestFilename } = require(`${__dirname}/constants.js`);

const buildAppName = (prefix, name) => prefix ? prefix + name : name;

const buildRoute = (routes, oldAppName, newAppName) => {
  const originalRoute = routes && routes[0].route;
  if (!originalRoute)
    return newAppName;

  return [{ route: originalRoute.replace(oldAppName, newAppName) }];
};

const verifyManifest = (manifest) => {
  if (!manifest.applications)
    throw new Error('Invalid application manifest yaml. No applications.');

  if (!manifest.applications[0].path)
    throw new Error('Invalid application manifest yaml. No path.');
};

const adjustOptionalProperties = (application, properties) => {
  if (properties.instances) application.instances = parseInt(properties.instances);
  if (properties.buildpack) application.buildpack = properties.buildpack;
};

const adjustManifest = (manifest, properties) => {
  const parsedManifest = yaml.load(manifest);

  verifyManifest(parsedManifest);

  if (!properties || Object.keys(properties).length === 0)
    return manifest;

  const app = parsedManifest.applications[0];
  const appName = buildAppName(properties.prefix, properties.name);
  const oldAppName = app.name;

  app.name = appName;
  app.routes = buildRoute(app.routes, oldAppName, appName);
  app.path = `../${app.path}`;

  adjustOptionalProperties(app, properties);

  return yaml.dump(parsedManifest);
};

const blueGreen = (appPath = '.') => {
  const manifestLoc = path.join(process.cwd(), appPath, originalManifestFilename);
  try {
    const manifest = yaml.load(fs.readFileSync(manifestLoc));
    return manifest.applications[0].zdm === true;
  } catch (err) {
    return false;
  }
};

const substitutionVariables = (environment) => yaml.dump(environment);

module.exports.adjustManifest = adjustManifest;
module.exports.blueGreen = blueGreen;
module.exports.substitutionVariables = substitutionVariables;
