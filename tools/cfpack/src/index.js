'use strict';

// Package an app and its local npm dependencies for deployment to Cloud Foundry

const _ = require('underscore');
const map = _.map;
const pairs = _.pairs;
const object = _.object;
const extend = _.extend;
const partial = _.partial;
const noop = _.noop;
const isEmpty = _.isEmpty;

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const commander = require('commander');

/* eslint no-process-exit: 1 */

const additionalDir = 'additionally_packed';

const makeSymlink = (additionalDirPath, path, cb) => {
  fs.unlink(path, (err) => {
    if (err) noop();
    fs.symlink(additionalDirPath, path, cb);
  });
};

// Create the directories we need
const mkdirs = (root, additional, cb) => {
  // Create .cfpack directory
  fs.mkdir('.cfpack', (err) => {
    if (err) noop();
    makeSymlink(path.join(root, 'lib'), '.cfpack/lib', () => {
      if (err) noop();
      else if (isEmpty(additional)) cb();
      else {
        const additionalDirPath = path.join(root, additional);
        fs.access(additionalDirPath, (err) => {
          if (err) cb();
          else
            makeSymlink(additionalDirPath,
              path.join('.cfpack', additionalDir), cb);
        });
      }
    });
  });
};

// Adjust a file: dependency to our packed app structure, by converting
// relative path from the module to a relative path to our package root
const local = (root, additional, d) => {
  const vendoredPath = path.resolve(d[1].substr(5)).
    replace(additional, additionalDir);
  const dependencyPath = path.join('file:.cfpack',
    path.relative(root, vendoredPath));
  return !/file:/.test(d[1]) ? d : [d[0], dependencyPath];
};

// Fixes dependencies locations for npm-shrinkwrap.json
const fixShwinkwrapDeps = (deps, loc) => {
  map(pairs(deps), (dep) => {
    const name = dep[0];
    const val = dep[1];
    const newPath = loc([name, val.resolved])[1];
    deps[name].resolved = newPath;
    if (/file:/.test(newPath))
      deps[name].from = newPath.substr(5);
    if (val.dependencies)
      fixShwinkwrapDeps(val.dependencies, loc);
  });
};

// Adjust local dependencies to our packed app structure and write new
// package.json.
const repackage = (root, additional, cb) => {
  const mod = require(path.join(process.cwd(), 'package.json'));
  const loc = partial(local, root, additional);
  const rmod = extend({}, mod, {
    dependencies: object(map(pairs(mod.dependencies), loc))
  }, {
    devDependencies: object(map(pairs(mod.devDependencies), loc))
  });
  fs.writeFile(path.join('.cfpack', 'package.json'),
    JSON.stringify(rmod, undefined, 2), (err) => {
      const shWrpPath = path.join(process.cwd(), 'npm-shrinkwrap.json');
      if (err || !fs.existsSync(shWrpPath))
        cb(err);
      else {
        const shrinkwrap = require(shWrpPath);
        fixShwinkwrapDeps(shrinkwrap.dependencies, loc);
        fs.writeFile(path.join('.cfpack', 'npm-shrinkwrap.json'),
        JSON.stringify(shrinkwrap, undefined, 2), cb);
      }
    });
};

const executeZip = (directories, ignore, cb) => {
  // We're using the system zip command here, may be better to use a
  // Javascript zip library instead
  const files = '-type f -not -regex "\\./\\.cfpack/package\\.json" ' +
    '-not -regex ".*/\\.git"  -not -regex ".*test\\.js" ' +
    '-not -regex "\\./\\.cfpack/npm-shrinkwrap\\.json"';
  const ex = cp.exec('(find . ' + directories + ' ' + files +
    ' | zip -q -x@' + ignore + ' -@ .cfpack/app.zip) && ' +
    '(zip -q -j .cfpack/app.zip .cfpack/package.json ' +
    '.cfpack/npm-shrinkwrap.json)', {
      cwd: process.cwd()
    });
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

// Produce the packaged app zip
const zip = (ignore, include, cb) => {
  fs.unlink(path.resolve('.cfpack', 'app.zip'), (err) => {
    if (err) noop();

    let directories = '.cfpack/lib/*';
    fs.access(include, (err) => {
      if (include && include.length !== 0)
        directories += err ? '' : ` ${include}/*`;
      executeZip(directories, ignore, cb);
    });
  });
};

// Return the Abacus root directory
const rootDir = (dir) => {
  if (dir === '/') return dir;
  try {
    if (JSON.parse(fs.readFileSync(
      path.resolve(dir, 'package.json')).toString()).name === 'cf-abacus')
      return dir;
    return rootDir(path.resolve(dir, '..'));
  }
  catch (e) {
    return rootDir(path.resolve(dir, '..'));
  }
};

const run = (root, additional, cb) => {
  // Create the directories we need
  mkdirs(root, additional, (err) => {
    if (err) {
      console.log('Couldn\'t setup cfpack layout -', err);
      cb(err);
    }

    // Generate the repackaged package.json
    repackage(root, additional, (err) => {
      if (err) {
        console.log('Couldn\'t write package.json -', err);
        cb(err);
      }
      // Produce the packaged app zip
      // zip(path.join(commander.root, '.gitignore'), (err) => {
      zip(path.join(root, '.gitignore'),
        additional ? path.join('.cfpack', additionalDir) : '',
        (err) => {
          if (err) {
            console.log('Couldn\'t produce .cfpack/app.zip -', err);
            cb(err);
          }
          cb();
        });
    });
  });
};

// Package an app for deployment to Cloud Foundry
const runCLI = () => {
  // Parse command line options
  commander
    // Accept root directory of local dependencies as a parameter, default
    // to the Abacus root directory
    .option(
    '-r, --root <dir>', 'root local dependencies directory',
    process.env.ABACUS_ROOT || rootDir(process.cwd()))
    .option(
    '-a, --additional <dir>', 'additional directory that will be packed',
    process.env.ADDITIONAL_PACK_DIR)
    .parse(process.argv);

  run(commander.root, commander.additional, (err) => {
    if (err)
      process.exit(1);
  });
};

// Export our CLI
module.exports.runCLI = runCLI;
// Export API access
module.exports.run = run;

