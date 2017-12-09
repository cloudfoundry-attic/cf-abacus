'use strict';

const _ = require('underscore');
const extend = _.extend;
const noop = _.noop;

const path = require('path');
const cp = require('child_process');
const async = require('async');

const commander = require('commander');
const fs = require('fs-extra');
const tmp = require('tmp');
const remanifester = require('./lib/remanifester.js');
const yaml = require('js-yaml');

tmp.setGracefulCleanup();

const originalManifestFilename = 'manifest.yml';
const defaultPushRetries = 1;

const createCfPushDir = (cb) => {
  fs.mkdir('.cfpush', (err) => {
    if (err) noop();
    cb();
  });
};

const remanifest = (props, cb) => {
  fs.readFile(path.join(process.cwd(), originalManifestFilename), (err, originalManifestContent) => {
    if (err) {
      cb(err);
      return;
    }

    const adjustedManifest = remanifester.adjustManifest(originalManifestContent, props);

    const adjustedManifestPath = path.join('.cfpush', [props.name, originalManifestFilename].join('-'));
    fs.writeFile(adjustedManifestPath, adjustedManifest, cb);
  });
};

const prepareTmpDir = () => {
  const tmpDir = tmp.dirSync({
    prefix: 'cfpush_',
    discardDescriptor: true,
    unsafeCleanup: true
  });

  const cfTmpDir = path.join(tmpDir.name, '.cf');
  const cfHomeDir = path.join(process.env.CF_HOME || process.env.HOME, '.cf');

  if (fs.existsSync(cfHomeDir)) fs.copySync(cfHomeDir, cfTmpDir);

  return tmpDir;
};

const executeCommand = (command, cb) => {
  const tmpDir = prepareTmpDir();
  const ex = cp.exec(command, {
    cwd: process.cwd(),
    env: extend({}, process.env, { CF_HOME: tmpDir.name })
  });
  ex.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
  ex.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  ex.on('close', (code) => {
    tmpDir.removeCallback();
    cb(code);
  });
};

const push = (props, cb) => {
  const startParam = props.start ? '' : '--no-start';
  const command = `cf push ${startParam} -f .cfpush/${props.name}-${originalManifestFilename}`;
  executeCommand(command, cb);
};

const rename = (props, cb) => {
  const appName = `${props.prefix}${props.name}`;
  const command = `cf rename ${appName} ${appName}-old`;
  return executeCommand(command, cb);
};

const deleteOld = (props, cb) => {
  const appName = `${props.prefix}${props.name}`;
  const command = `cf delete -f ${appName}-old`;
  executeCommand(command, cb);
};

const prepareZdm = (props, cb) => {
  if (props.prepareZdm) {
    const appName = `${props.prefix}${props.name}`;
    const command = `cf app ${appName}`;
    executeCommand(command, (code) => {
      if (code > 0) return cb();
      return deleteOld(props, (error) => {
        if (error) return cb(error);
        return rename(props, cb);
      });
    });
  } else cb();
};

const retryPush = (properties, cb) => {
  let retryAttempts = 0;

  const retryCb = (error) => {
    retryAttempts++;
    if (error && retryAttempts < properties.retries) {
      push(properties, retryCb);
      return;
    }

    cb(error);
  };

  push(properties, retryCb);
};

const getBlueGreenOptionFromManifest = () => {
  const manifestLoc = path.join(process.cwd(), originalManifestFilename);
  try {
    const manifest = yaml.load(fs.readFileSync(manifestLoc));
    return manifest.applications[0].zdm === true;
  } catch (err) {
    return false;
  }
};

const runCLI = () => {
  commander
    .option('-n, --name <name>', 'app name', require(path.join(process.cwd(), 'package.json')).name)
    .option('-i, --instances <nb>', 'number of instances')
    .option('-c, --conf [value]', 'configuration name', process.env.CONF)
    .option('-b, --buildpack [value]', 'buildpack name or location', process.env.BUILDPACK)
    .option('-x, --prefix [value]', 'host prefix', process.env.ABACUS_PREFIX)
    .option('-s, --start', 'starts an app after pushing')
    .option('-r, --retries [value]', 'number of retries if app push fails', defaultPushRetries)
    .option('-z, --prepare-zdm [boolean]', 'perform zero downtime (blue-green) deployment')
    .parse(process.argv);

  const requestZdm = commander.prepareZdm ? commander.prepareZdm : getBlueGreenOptionFromManifest();

  const commanderProps = {
    name: commander.name,
    instances: commander.instances,
    conf: commander.conf,
    buildpack: commander.buildpack,
    prefix: commander.prefix,
    start: commander.start,
    retries: commander.retries,
    prepareZdm: requestZdm
  };

  async.series(
    [
      (callback) => createCfPushDir(callback),
      (callback) => remanifest(commanderProps, callback),
      (callback) => prepareZdm(commanderProps, callback),
      (callback) => retryPush(commanderProps, callback)
    ],
    (error, results) => {
      if (error) {
        console.log('Couldn\'t push app %s -', commander.name, error);
        throw error;
      }
    }
  );
};

module.exports.runCLI = runCLI;
