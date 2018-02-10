'use strict';

// Publish a module to the npm registry.

const { map, pairs, object, extend } = require('underscore');
const commander = require('commander');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const localDependencyVersion = (file) =>
  JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file.substr(5), 'package.json')).toString()).version;

const publicizeDependency = (deps) =>
  object(map(pairs(deps), (dep) => /^file:/.test(dep[1]) ? [dep[0], '^' + localDependencyVersion(dep[1])] : dep));

const storeModule = (packageFile, content) =>
  fs.writeFileSync(packageFile, content);

const createPublicizedPackageFile = (packageFile, module) => {
  const publicizedModule = extend({}, module, {
    private: false,
    dependencies: publicizeDependency(module.dependencies),
    devDependencies: publicizeDependency(module.devDependencies)
  });
  storeModule(packageFile, JSON.stringify(publicizedModule, undefined, 2));
};

const execCommand = (command, workDir) => new Promise((resolve, reject) => {
  const ex = cp.exec(command, { cwd: workDir });

  ex.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
  ex.stderr.on('data', (data) => {
    process.stderr.write(data);
  });
  ex.on('close', (code) => {
    if (code === 0)
      resolve();
    else
      reject(code);
  });
});

const publishModule = async(version, workDir) =>
  await execCommand(`yarn publish --new-version ${version}`, workDir);

const runCLI = () => {
  commander
    .option('-i, --ignore-failures', 'Ignore publish errors')
    .parse(process.argv);

  const moduleDir = process.cwd();
  const packageFile = path.join(moduleDir, 'package.json');
  const moduleContent = fs.readFileSync(packageFile, { encoding: 'UTF-8' });
  const module = JSON.parse(moduleContent);

  createPublicizedPackageFile(packageFile, module);
  publishModule(module.version, moduleDir)
    .then(() => storeModule(packageFile, moduleContent))
    .catch(() => {
      storeModule(packageFile, moduleContent);
      if (!commander.ignoreFailures)
        process.exit(1); // eslint no-process-exit: 1
    });
};

// Export our CLI
module.exports.runCLI = runCLI;
