'use strict';

// Publish a module to the npm registry.

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var commander = require('commander');

var map = _.map;
var pairs = _.pairs;
var object = _.object;
var extend = _.extend;

/* eslint no-process-exit: 1 */

// Create the directories we need
var mkdirs = function(pubdir, cb) {
  fs.mkdir(pubdir, function() {
    fs.mkdir(path.resolve(pubdir, 'package'), function() {
      cb();
    });
  });
};

// Return the version of a local dependency
var version = function(file) {
  return JSON.parse(fs.readFileSync(path.resolve(
    process.cwd(), file.substr(5), 'package.json')).toString()).version;
};

// Convert local dependencies to public versioned dependencies
var publicize = function(deps) {
  return object(map(pairs(deps), function(dep) {
    return /^file:/.test(dep[1]) ? [dep[0], '^' + version(dep[1])] :
      dep;
  }));
};

// Pack a module
var pack = function(name, version, pubdir, cb) {
  var tgz = name + '-' + version + '.tgz';
  fs.unlink(path.resolve(pubdir, tgz), function() {
    var ex = cp.exec('npm pack ..', {
      cwd: pubdir
    });
    ex.stdout.on('data', function(data) {
      process.stdout.write(data);
    });
    ex.stderr.on('data', function(data) {
      process.stderr.write(data);
    });
    ex.on('close', function(code) {
      cb(code, tgz);
    });
  });
};

// Convert local dependencies to public npm dependencies
var repackage = function(mod, pubdir, cb) {
  var pkg = path.resolve(pubdir, 'package/package.json');
  fs.unlink(pkg, function() {
    var rmod = extend({}, mod, {
      private: false,
      dependencies: publicize(mod.dependencies),
      devDependencies: publicize(mod.devDependencies)
    });
    fs.writeFile(pkg, JSON.stringify(rmod, undefined, 2), cb);
  });
};

// Publish a module
var publish = function(tgz, pubdir, cb) {
  var tar = tgz.replace(/\.tgz$/, '.tar');
  var ex = cp.exec('gunzip ' + tgz + ' && tar -uf ' + tar +
    ' package && gzip -c ' + tar + ' > ' + tgz + ' && rm ' + tar +
    ' && npm publish ./' + tgz, {
      cwd: pubdir
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

// Publish a module to npm
var runCLI = function() {
  // Parse command line options
  commander
    .parse(process.argv);

  // Create the directories we need
  var pubdir = path.resolve(process.cwd(), '.publish');
  mkdirs(pubdir, function(err) {
    if(err) {
      console.log('Couldn\'t setup publish layout -', err);
      process.exit(1);
    }

    // Pack the module
    var mod = require(path.join(process.cwd(), 'package.json'));
    pack(mod.name, mod.version, pubdir, function(code, tgz) {
      if(code) {
        console.log('Couldn\'t pack module -', code);
        process.exit(code);
      }

      // Convert the module's package.json
      repackage(mod, pubdir, function(err, pkg) {
        if(err) {
          console.log('Couldn\'t repackage package.json -', err);
          process.exit(1);
        }

        // Publish the module
        publish(tgz, pubdir, function(err) {
          if(err) {
            console.log('Couldn\'t publish module -', err);
            process.exit(1);
          }
        });
      });
    });
  });
};

// Export our CLI
module.exports.runCLI = runCLI;

