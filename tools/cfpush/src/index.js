'use strict';

// Deploy an app to Cloud Foundry

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var commander = require('commander');
var yaml = require('js-yaml');

var noop = _.noop;

/* eslint no-process-exit: 1 */

// Create the directories we need
var mkdirs = function(cb) {
  // Create .cfpush directory
  fs.mkdir('.cfpush', function(err) {
    if(err) noop();
    cb();
  });
};

// Adjust manifest.yml env variables
var adjustManifest = function(app, name, instances, conf, buildpack) {
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
var remanifest = function(root, name, instances, conf, buildpack, cb) {
  fs.readFile(
    path.join(process.cwd(), 'manifest.yml'), function(err, content) {
      if(err) {
        cb(err);
        return;
      }
      var yml = yaml.load(content);
      var app = yml.applications[0];

      adjustManifest(app, name, instances, conf, buildpack);

      fs.writeFile(
        path.join('.cfpush', [name, 'manifest.yml'].join('-')),
        yaml.dump(yml), cb);
    });
};

// Push an app
var push = function(name, start, cb) {
  var command = 'cf push ' +
    (start ? '' : '--no-start ') +
    '-f .cfpush/' + [name, 'manifest.yml'].join('-');
  var ex = cp.exec(command, {
    cwd: process.cwd()
  });
  ex.stdout.on('data', function(data) {
    process.stdout.write(data);
  });
  ex.stderr.on('data', function(data) {
    process.stderr.write(data);
  });
  ex.on('close', function(code) {
    cb(code);
  });
};

// Package an app for deployment to Cloud Foundry
var runCLI = function() {
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
    .option('-s, --start',
      'start an app after pushing')
    .parse(process.argv);

  // Create the directories we need
  mkdirs(function(err) {
    if(err) {
      console.log('Couldn\'t setup cfpack layout -', err);
      process.exit(1);
    }

    // Generate the updated manifest.yml
    remanifest(commander.root, commander.name, commander.instances,
      commander.conf, commander.buildpack, function(err) {
        if(err) {
          console.log('Couldn\'t write manifest.yml -', err);
          process.exit(1);
        }

        // Produce the packaged app zip
        push(commander.name, commander.start, function(err) {
          if(err) {
            console.log('Couldn\'t push app %s -', commander.name, err);
            process.exit(1);
          }
        });
      });
  });
};

// Export our CLI
module.exports.runCLI = runCLI;

