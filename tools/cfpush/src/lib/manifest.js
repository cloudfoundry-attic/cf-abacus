'use strict';

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

const { originalManifestFilename } = require(`${__dirname}/constants.js`);

const buildAppName = (prefix, name) => {
  return prefix ? prefix + name : name;
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

  if (properties.conf) {
    if (!application.env) application.env = {};
    application.env.CONF = properties.conf;
  }
};

const adjustManifest = (manifest, properties) => {
  const parsedManifest = yaml.load(manifest);

  verifyManifest(parsedManifest);

  if (!properties || Object.keys(properties).length === 0)
    return manifest;

  const app = parsedManifest.applications[0];
  const appName = buildAppName(properties.prefix, properties.name);

  app.name = appName;
  app.host = appName;
  app.path = '../' + app.path;

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

module.exports.adjustManifest = adjustManifest;
module.exports.blueGreen = blueGreen;
