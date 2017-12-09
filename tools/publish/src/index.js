'use strict';

// Publish a module to the npm registry.

const _ = require('underscore');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const commander = require('commander');

const map = _.map;
const pairs = _.pairs;
const object = _.object;
const extend = _.extend;

/* eslint no-process-exit: 1 */

// Create the directories we need
const mkdirs = (pubdir, cb) => {
  fs.mkdir(pubdir, () => {
    fs.mkdir(path.resolve(pubdir, 'package'), () => {
      cb();
    });
  });
};

// Return the version of a local dependency
const version = (file) =>
  JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file.substr(5), 'package.json')).toString()).version;

// Convert local dependencies to public versioned dependencies
const publicize = (deps) =>
  object(map(pairs(deps), (dep) => /^file:/.test(dep[1]) ? [dep[0], '^' + version(dep[1])] : dep));

// Pack a module
const pack = (name, version, pubdir, cb) => {
  const tgz = name + '-' + version + '.tgz';
  fs.unlink(path.resolve(pubdir, tgz), () => {
    const ex = cp.exec('npm pack ..', {
      cwd: pubdir
    });
    ex.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    ex.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    ex.on('close', (code) => {
      cb(code, tgz);
    });
  });
};

// Convert local dependencies to public npm dependencies
const repackage = (mod, pubdir, cb) => {
  const pkg = path.resolve(pubdir, 'package/package.json');
  fs.unlink(pkg, () => {
    const rmod = extend({}, mod, {
      private: false,
      dependencies: publicize(mod.dependencies),
      devDependencies: publicize(mod.devDependencies)
    });
    fs.writeFile(pkg, JSON.stringify(rmod, undefined, 2), cb);
  });
};

// Publish a module
const publish = (tgz, pubdir, cb) => {
  const tar = tgz.replace(/\.tgz$/, '.tar');
  const ex = cp.exec(
    'gunzip ' +
      tgz +
      ' && tar -uf ' +
      tar +
      ' package && gzip -c ' +
      tar +
      ' > ' +
      tgz +
      ' && rm ' +
      tar +
      ' && npm publish ./' +
      tgz,
    { cwd: pubdir }
  );
  ex.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
  ex.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  ex.on('close', (code) => {
    cb(code);
  });
};

// Publish a module to npm
const runCLI = () => {
  // Parse command line options
  commander.parse(process.argv);

  // Create the directories we need
  const pubdir = path.resolve(process.cwd(), '.publish');
  mkdirs(pubdir, (err) => {
    if (err) {
      console.log('Couldn\'t setup publish layout -', err);
      process.exit(1);
    }

    // Pack the module
    const mod = require(path.join(process.cwd(), 'package.json'));
    pack(mod.name, mod.version, pubdir, (code, tgz) => {
      if (code) {
        console.log('Couldn\'t pack module -', code);
        process.exit(code);
      }

      // Convert the module's package.json
      repackage(mod, pubdir, (err, pkg) => {
        if (err) {
          console.log('Couldn\'t repackage package.json -', err);
          process.exit(1);
        }

        // Publish the module
        publish(tgz, pubdir, (err) => {
          if (err) {
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
