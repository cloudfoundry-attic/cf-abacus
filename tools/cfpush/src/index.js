'use strict';

const { noop } = require('underscore');

const path = require('path');
const async = require('async');

const commander = require('commander');
const fs = require('fs-extra');
const manifest = require('./lib/manifest.js');
const bluegreen = require('./lib/bluegreen.js');
const { cfPushDirname, originalManifestFilename, substitutionVariablesFilename } = require('./lib/constants.js');

const defaultPushRetries = 1;

const createCfPushDir = (appPath, cb) => {
  fs.mkdir(path.join(process.cwd(), appPath, cfPushDirname), (err) => {
    if (err) noop();
    cb();
  });
};

const remanifest = (props, cb) => {
  fs.readFile(path.join(process.cwd(), props.path, originalManifestFilename), (err, originalManifestContent) => {
    if (err) {
      cb(err);
      return;
    }

    const adjustedManifest = manifest.adjustManifest(originalManifestContent, props);

    const adjustedManifestPath =
      path.join(process.cwd(), props.path, cfPushDirname, [props.name, originalManifestFilename].join('-'));

    fs.writeFile(adjustedManifestPath, adjustedManifest, cb);
  });
};

const createSubstitutionVariables = (props, cb) => {
  const varsFile = path.join(process.cwd(), props.path, cfPushDirname, substitutionVariablesFilename);

  fs.writeFileSync(varsFile, '---\n');
  for(let key in process.env)
    try {
      const value = process.env[key];
      if (value)
        fs.appendFileSync(varsFile, `${key}: ${value}\n`);
    } catch (err) {
      cb(err);
      return;
    }

  cb();
};

const runCLI = () => {
  commander
    .option('-n, --name <name>', 'app name', require(path.join(process.cwd(), 'package.json')).name)
    .option('-i, --instances <nb>', 'number of instances')
    .option('-c, --conf [value]', 'configuration name', process.env.CONF)
    .option('-b, --buildpack [value]', 'buildpack name or location', process.env.BUILDPACK)
    .option('-x, --prefix [value]', 'host prefix', process.env.ABACUS_PREFIX)
    .option('-p, --path [value]', 'path to the application', '.')
    .option('-s, --start', 'starts an app after pushing')
    .option('-r, --retries [value]', 'number of retries if app push fails', defaultPushRetries)
    .option('-z, --prepare-zdm [boolean]', 'perform zero downtime (blue-green) deployment')
    .parse(process.argv);

  const requestZdm = commander.prepareZdm ? commander.prepareZdm : manifest.blueGreen(commander.path);

  const commanderProps = {
    name: commander.name,
    instances: commander.instances,
    conf: commander.conf,
    buildpack: commander.buildpack,
    prefix: commander.prefix,
    path: commander.path,
    start: commander.start,
    retries: commander.retries,
    prepareZdm: requestZdm
  };

  async.series([
    (callback) => createCfPushDir(commander.path, callback),
    (callback) => remanifest(commanderProps, callback),
    (callback) => createSubstitutionVariables(commanderProps, callback),
    (callback) => bluegreen.prepareZdm(commanderProps, callback),
    (callback) => bluegreen.push(commanderProps, callback)
  ],(error, results) => {
    if (error) {
      console.log('Cannot push app %s -', commander.name, error);
      throw error;
    }
  });
};

module.exports.runCLI = runCLI;
