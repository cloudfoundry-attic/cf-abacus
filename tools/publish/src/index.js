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

const mkdirs = (pubdir, cb) => {
  fs.mkdir(pubdir, () => {
    fs.mkdir(path.resolve(pubdir, 'package'), () => {
      cb();
    });
  });
};

const localDependencyVersion = (file) =>
  JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file.substr(5), 'package.json')).toString()).version;

const publicizeDependency = (deps) =>
  object(map(pairs(deps), (dep) => /^file:/.test(dep[1]) ? [dep[0], '^' + localDependencyVersion(dep[1])] : dep));

const execCommand = (command, workDir, cb) => {
  const ex = cp.exec(command, { cwd: workDir });

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

const packModule = (name, version, pubdir, cb) => {
  const tgz = name + '-v' + version + '.tgz';
  const command = `yarn pack --filename ${pubdir}/${tgz}`;

  fs.unlink(path.resolve(pubdir, tgz), () => {
    execCommand(command, pubdir, (code) => {
      cb(code, tgz);
    });
  });
};

const createPublicizedPackageFile = (mod, pubdir, cb) => {
  const rmod = extend({}, mod, {
    private: false,
    dependencies: publicizeDependency(mod.dependencies),
    devDependencies: publicizeDependency(mod.devDependencies)
  });
  const pkg = path.resolve(pubdir, 'package/package.json');

  fs.unlink(pkg, (err) => {
    if (err) {
      cb(err);
      return;
    }
    fs.writeFile(pkg, JSON.stringify(rmod, undefined, 2), (err) => {
      if (err) {
        cb(err);
        return;
      }

      cb();
    });
  });
};

const repackageWithPublicDependencies = (mod, tgz, pubdir, cb) => {
  execCommand(`tar -xf ${tgz}`, pubdir, (err) => {
    if (err) {
      cb(err);
      return;
    }
    createPublicizedPackageFile(mod, pubdir, (err) => {
      if (err) {
        cb(err);
        return;
      }

      execCommand(`rm ${tgz} && tar -czf ${tgz} package`, pubdir, cb);
    });
  });
};

const publishModule = (tgz, pubdir, cb) => {
  execCommand(`yarn publish ./${tgz}`, pubdir, cb);
};

// Publish a module to npm
const runCLI = () => {
  commander.parse(process.argv);

  const pubdir = path.resolve(process.cwd(), '.publish');
  mkdirs(pubdir, (err) => {
    /* eslint no-process-exit: 1 */
    if (err) {
      console.log('Couldn\'t setup publish layout -', err);
      process.exit(1);
    }

    const mod = require(path.join(process.cwd(), 'package.json'));
    packModule(mod.name, mod.version, pubdir, (err, tgz) => {
      if (err) {
        console.log('Couldn\'t pack module -', err);
        process.exit(err);
      }

      repackageWithPublicDependencies(mod, tgz, pubdir, (err) => {
        if (err) {
          console.log('Couldn\'t repackage module -', err);
          process.exit(1);
        }

        publishModule(tgz, pubdir, (err) => {
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
