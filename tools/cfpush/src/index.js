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
  fs.readFile(path.join(process.cwd(), originalManifestFilename),
    (err, originalManifestContent) => {
      if (err) {
        cb(err);
        return;
      }

      const adjustedManifest = remanifester
        .adjustManifest(originalManifestContent, props);

      const adjustedManifestPath = path.join('.cfpush',
        [props.name, originalManifestFilename].join('-'));
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
  const cfHomeDir = path.join(
    process.env.CF_HOME || process.env.HOME, '.cf'
  );

  if (fs.existsSync(cfHomeDir))
    fs.copySync(cfHomeDir, cfTmpDir);

  return tmpDir;
};

const push = (props, cb) => {
  const startParam = props.start ? '' : '--no-start';
  const command =
  `cf push ${startParam} -f .cfpush/${props.name}-${originalManifestFilename}`;

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

const runCLI = () => {
  commander
    .option('-n, --name <name>', 'app name',
      require(path.join(process.cwd(), 'package.json')).name)
    .option('-i, --instances <nb>', 'number of instances')
    .option('-c, --conf [value]', 'configuration name', process.env.CONF)
    .option('-b, --buildpack [value]', 'buildpack name or location',
      process.env.BUILDPACK)
    .option('-x, --prefix [value]', 'host prefix', process.env.ABACUS_PREFIX)
    .option('-s, --start', 'starts an app after pushing')
    .option('-r, --retries [value]', 'number of retries if app push fails',
      defaultPushRetries)
    .parse(process.argv);

  const commanderProps = {
    name: commander.name,
    instances: commander.instances,
    conf: commander.conf,
    buildpack: commander.buildpack,
    prefix: commander.prefix,
    retries: commander.retries
  };

  async.series([
    (callback) => createCfPushDir(callback),
    (callback) => remanifest(commanderProps, callback),
    (callback) => retryPush(commanderProps, callback)
  ], (error, results) => {
    if (error) {
      console.log('Couldn\'t push app %s -', commander.name, error);
      throw error;
    }
  });

};

module.exports.runCLI = runCLI;
