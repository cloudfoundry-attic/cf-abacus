'use-strict';

/*

Provides functionality for starting and stopping abacus modules

Usage:
// Use stdout and stderr for commands output
const npm = require('abacus-npm')();
npm.startModules([npm.modules.renewer], cb);

// Use custom streams for commands output
const npm = require('abacus-npm')(outStream, errStream);
npm.startModules([npm.modules.renewer], cb);

*/

const _ = require('underscore');
const clone = _.clone;
const map = _.map;

const debug = require('abacus-debug')('abacus-npm');
const cp = require('child_process');


const startedModules = new Set();
let start, stop;

const getModuleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

const define = (operation, out, err) =>  (module, onExitCb) => {
  const moduleDir = getModuleDir(module);
  debug('Executing "%s" operation on module "%s" in directory %s',
   operation, module, moduleDir);

  const c = cp.spawn('npm', ['run', operation], {
    cwd: moduleDir,
    env: clone(process.env)
  });

  c.stdout.on('data', (data) => out.write(data));
  c.stderr.on('data', (data) => err.write(data));
  c.on('exit', (code) => {
    onExitCb();
  });
};

const startModules = (modules, afterAllStartedCb = () => {}) => {
  const oldStartedModulesCount = startedModules.size;
  map(modules, (module) => start(module, () => {
    startedModules.add(module);
    if (startedModules.size === oldStartedModulesCount + modules.length)
      afterAllStartedCb();
  }));
};

const stopAllStarted = (afterAllStoppedCb = () => {}) => {
  if (startedModules.size === 0) {
    afterAllStoppedCb();
    return;
  }
  
  startedModules.forEach((module) => stop(module, () => {
    startedModules.delete(module);
    if (!startedModules.size)
      afterAllStoppedCb();
  }));
};

const modules = {
  accountPlugin: 'abacus-account-plugin',
  eurekaPlugin: 'abacus-eureka-plugin',
  provisioningPlugin: 'abacus-provisioning-plugin',
  collector: 'abacus-usage-collector',
  meter: 'abacus-usage-meter',
  accumulator: 'abacus-usage-accumulator',
  aggregator: 'abacus-usage-aggregator',
  reporting: 'abacus-usage-reporting',
  bridge: 'abacus-cf-bridge',
  renewer: 'abacus-cf-renewer',
  pouchserver: 'abacus-pouchserver'
};

module.exports = (out = process.stdout, err = process.stderr) => {
  start = define('start', out, err);
  stop = define('stop', out, err);

  return {
    modules,
    startModules,
    stopAllStarted
  }; 
}
