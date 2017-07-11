'use strict';

// Deploy an app to Cloud Foundry

const _ = require('underscore');
const extend = _.extend;
const noop = _.noop;

const path = require('path');
const cp = require('child_process');

const commander = require('commander');
const fs = require('fs-extra');
const tmp = require('tmp');
tmp.setGracefulCleanup();
const yaml = require('js-yaml');

/* eslint no-process-exit: 1 */

// Create the directories we need
const mkdirs = (cb) => {
  // Create .cfpush directory
  fs.mkdir('.cfpush', (err) => {
    if (err) noop();
    cb();
  });
};

// Adjust manifest.yml env variables
const adjustManifest = (app, name, instances, conf, buildpack) => {
  if (app) {
    app.name = name;
    app.host = name;
    if (instances)
      app.instances = parseInt(instances);
    app.path = '../' + app.path;
    if (conf) {
      if (!app.env) app.env = {};
      app.env.CONF = conf;
    }
    if (buildpack)
      app.buildpack = buildpack;
  }
};

// Write new manifest.yml
const remanifest = (root, name, instances, conf, buildpack, prefix, cb) => {
  fs.readFile(
    path.join(process.cwd(), 'manifest.yml'), (err, content) => {
      if (err) {
        cb(err);
        return;
      }
      const yml = yaml.load(content);
      const app = yml.applications[0];
      const appName = prefix ? [prefix, name].join('') : name;

      adjustManifest(app, appName, instances, conf, buildpack);

      fs.writeFile(
        path.join('.cfpush', [name, 'manifest.yml'].join('-')),
        yaml.dump(yml), cb);
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

// Push an app
const push = (name, start, cb) => {
  const command = 'cf push ' +
    (start ? '' : '--no-start ') +
    '-f .cfpush/' + [name, 'manifest.yml'].join('-');
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
  // Parse command line options
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

  // Create the directories we need
  mkdirs((err) => {
    if (err) {
      console.log('Couldn\'t setup cfpack layout -', err);
      process.exit(1);
    }

    // Generate the updated manifest.yml
    remanifest(commander.root, commander.name, commander.instances,
      commander.conf, commander.buildpack, commander.prefix, (err) => {
        if (err) {
          console.log('Couldn\'t write manifest.yml -', err);
          process.exit(1);
        }

        // Produce the packaged app zip
        push(commander.name, commander.start, (err) => {
          if (err) {
            console.log('Couldn\'t push app %s -', commander.name, err);
            process.exit(1);
          }
        });
      });
  });
};

// Export our CLI
module.exports.runCLI = runCLI;
