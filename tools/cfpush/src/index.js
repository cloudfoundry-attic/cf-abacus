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

const mkdirs = (cb) => {
  fs.mkdir('.cfpush', (err) => {
    if (err) noop();
    cb();
  });
};

const remanifest = (name, instances, conf, buildpack, prefix, cb) => {
  fs.readFile(
    path.join(process.cwd(), 'manifest.yml'), (err, content) => {
      if (err) {
        cb(err);
        return;
      }

      const props = { prefix, name, instances, buildpack, conf };
      const adjustedManifest = remanifester.adjustManifest(content, props);

      fs.writeFile(
        path.join('.cfpush', [name, 'manifest.yml'].join('-')),
        adjustedManifest, cb);
    });
};

const prepareTmpDir = () => {
  const tmpDir = tmp.dirSync({
    prefix: 'cfpush_',
    discardDescriptor: true,
    unsafeCleanup: true
  });

  const cfTmpDir = path.join(tmpDir.name, '.cf');
  const cfSettings = path.join(
    process.env.CF_HOME || process.env.HOME, '.cf'
  );
  if (fs.existsSync(cfSettings))
    fs.copySync(cfSettings, cfTmpDir);

  return tmpDir;
};

const push = (name, start, cb) => {
  const startParam = start ? '' : '--no-start';
  const command = `cf push ${startParam} -f .cfpush/${name}-manifest.yml`;

  const tmpDir = prepareTmpDir();
  const ex = cp.exec(command, {
    cwd: process.cwd(),
    env: extend(process.env, { CF_HOME: tmpDir.name })
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

// Package an app for deployment to Cloud Foundry
const runCLI = () => {
  commander
  // Accept root directory of local dependencies as a parameter, default
  // to the Abacus root directory
    .option('-n, --name <name>', 'app name',
      require(path.join(process.cwd(), 'package.json')).name)
    .option('-i, --instances <nb>', 'nb of instances')
    .option('-c, --conf <value>',
      'configuration name', process.env.CONF)
    .option('-b, --buildpack <value>',
      'buildpack name or location', process.env.BUILDPACK)
    .option('-x, --prefix <value>',
      'host prefix (like \"dev\", \"prod\")', process.env.ABACUS_PREFIX)
    .option('-s, --start',
      'start an app after pushing')
    .parse(process.argv);


  async.series([
    (callback) => mkdirs(callback),
    (callback) => remanifest(commander.name, commander.instances,
      commander.conf, commander.buildpack, commander.prefix, callback),
    (callback) => push(commander.name, commander.start, callback)
  ], (error, results) => {
    if (error) {
      console.log('Couldn\'t push app %s -', commander.name, error);
      throw error;
    }
  });

};

module.exports.runCLI = runCLI;
