'use strict';

// Package an app and its local npm dependencies for deployment to Cloud Foundry

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var commander = require('commander');
var archiver = require('archiver');
var globby = require('globby');

var map = _.map;
var pairs = _.pairs;
var object = _.object;
var extend = _.extend;
var partial = _.partial;
var noop = _.noop;

/* eslint no-process-exit: 1 */

// Create the directories we need
var mkdirs = function(root, cb) {
  // Create .cfpack directory
  fs.mkdir('.cfpack', function(err) {
    if(err) noop();
    fs.unlink('.cfpack/lib', function(err) {
      if(err) noop();
      fs.symlink(path.join(root, 'lib'), '.cfpack/lib', cb);
    });
  });
};

// Adjust a file: dependency to our packed app structure, by converting
// relative path from the module to a relative path to our package root
var local = function(root, d) {
  return !/file:/.test(d[1]) ? d : [d[0], path.join(
    'file:.cfpack', path.relative(root, path.resolve(d[1].substr(5))))];
};

// Adjust local dependencies to our packed app structure and write new
// package.json
var repackage = function(root, cb) {
  var mod = require(path.join(process.cwd(), 'package.json'));
  var loc = partial(local, root);
  var rmod = extend({}, mod, {
    dependencies: object(map(pairs(mod.dependencies), loc))
  }, {
    devDependencies: object(map(pairs(mod.devDependencies), loc))
  });
  fs.writeFile(path.join('.cfpack', 'package.json'),
    JSON.stringify(rmod, undefined, 2), cb);
};

// Produce the packaged app zip
var zip = function(cb) {
  fs.unlink(path.resolve('.cfpack', 'app.zip'), function(err) {

    if(err) noop();

    var patterns = ['**/*', '!.gitignore', '!.cfpack/app.zip',
      '!.cfpack/lib/**/.cfpack/**', '!.cfpack/lib/**/.gitignore'];

    var output = fs.createWriteStream('.cfpack/app.zip');
    var archive = archiver('zip');

    output.on('close', function() {
      console.log(archive.pointer() + ' byte(s)');
      cb(0);
    });

    archive.on('error', function(err) {
      cb(err);
    });

    archive.pipe(output);

    globby(patterns, {
      dot: true,
      follow: true
    }).catch(function(e) {
      cb(e);
    }).then(function(paths) {
      map(paths, function(path) {
        archive.file(path, { src : path });
      })
      archive.file('.cfpack/package.json', { src: 'package.json' });
      archive.finalize();
    });
  });
};

// Return the Abacus root directory
var rootDir = function(dir) {
  if(dir === '/') return dir;
  try {
    if(JSON.parse(fs.readFileSync(
      path.resolve(dir, 'package.json')).toString()).name === 'cf-abacus')
      return dir;
    return rootDir(path.resolve(dir, '..'));
  }
  catch (e) {
    return rootDir(path.resolve(dir, '..'));
  }
};

// Package an app for deployment to Cloud Foundry
var runCLI = function() {
  // Parse command line options
  commander
    // Accept root directory of local dependencies as a parameter, default
    // to the Abacus root directory
    .option(
      '-r, --root <dir>', 'root local dependencies directory',
      rootDir(process.cwd()))
    .parse(process.argv);

  // Create the directories we need
  mkdirs(commander.root, function(err) {
    if(err) {
      console.log('Couldn\'t setup cfpack layout -', err);
      process.exit(1);
    }

    // Generate the repackaged package.json
    repackage(commander.root, function(err) {
      if(err) {
        console.log('Couldn\'t write package.json -', err);
        process.exit(1);
      }

      // Produce the packaged app zip
      zip(function(err) {
        if(err) {
          console.log('Couldn\'t produce .cfpack/app.zip -', err);
          process.exit(1);
        }
      });
    });
  });
};

// Export our CLI
module.exports.runCLI = runCLI;
