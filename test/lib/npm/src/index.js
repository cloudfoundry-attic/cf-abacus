'use-strict';

/*

Provides functionality for starting and stopping abacus modules

Usage:
// Use stdout and stderr for commands output
const npm = require('abacus-npm');
npm.startModules([npm.modules.renewer], cb);

// Use custom streams for commands output
const npm = require('abacus-npm').use({
  out: outStream,
  err: errStream
});
npm.startModules([npm.modules.renewer], cb);

*/

const _ = require('underscore');
const clone = _.clone;
const map = _.map;

const debug = require('abacus-debug')('abacus-npm');
const cp = require('child_process');


const startedModules = new Set();

const getModuleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

const defineNpmOperation = (operation) => (streams, module, onExitCb) => {
  const moduleDir = getModuleDir(module);
  debug('Executing "%s" operation on module "%s" in directory %s',
   operation, module, moduleDir);

  const c = cp.spawn('npm', ['run', operation], {
    cwd: moduleDir,
    env: clone(process.env)
  });

  c.stdout.on('data', (data) => streams.out.write(data));
  c.stderr.on('data', (data) => streams.err.write(data));
  c.on('exit', (code) => {
    onExitCb();
  });
};

const start = defineNpmOperation('start');
const stop = defineNpmOperation('stop');

const startModules = (streams, modules, afterAllStartedCb = () => {}) => {
  if (!modules || modules.length === 0) {
    afterAllStartedCb();
    return;
  }

  let started = 0;
  map(modules, (module) => start(streams, module, () => {
    startedModules.add(module);
    if (++started === modules.length)
      afterAllStartedCb();
  }));
};

const stopAllStarted = (streams, afterAllStoppedCb = () => {}) => {
  if (startedModules.size === 0) {
    afterAllStoppedCb();
    return;
  }
  
  startedModules.forEach((module) => stop(streams, module, () => {
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
  applications: 'abacus-cf-applications',
  services: 'abacus-cf-services',
  renewer: 'abacus-cf-renewer',
  pouchserver: 'abacus-pouchserver'
};

const defaultStreams = {
  out: process.stdout,
  err: process.stderr
};

module.exports = {
  modules,

  startModules: (modules, afterAllStartedCb) =>
    startModules(defaultStreams, modules, afterAllStartedCb),
  stopAllStarted: (afterAllStoppedCb) =>
    stopAllStarted(defaultStreams, afterAllStoppedCb),

  use: (streams) => {
    return {
      modules,

      startModules: (modules, afterAllStartedCb) =>
        startModules(streams, modules, afterAllStartedCb),
      stopAllStarted: (afterAllStoppedCb) =>
        stopAllStarted(streams, afterAllStoppedCb)
    };
  }
};
