'use-strict';

const _ = require('underscore');
const clone = _.clone;
const map = _.map;

const debug = require('abacus-debug')('abacus-npm');

const cp = require('child_process');

const startedModules = [];

const moduleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

const start = (module, cb = () => {}) => {
  debug('Starting %s in directory %s', module, moduleDir(module));
  const c = cp.spawn('npm', ['run', 'start'], {
    cwd: moduleDir(module),
    env: clone(process.env)
  });

  // Add listeners to stdout, stderr and exit message and forward the
  // messages to debug logs
  c.stdout.on('data', (data) => process.stdout.write(data));
  c.stderr.on('data', (data) => process.stderr.write(data));
  c.on('exit', (code) => {
    startedModules.push(module);
    cb(module, code);
  });
};

const stop = (module, cb = () => {}) => {
  debug('Stopping %s in directory %s', module, moduleDir(module));
  const c = cp.spawn('npm', ['run', 'stop'],
    { cwd: moduleDir(module), env: clone(process.env) });

  // Add listeners to stdout, stderr and exit message and forward the
  // messages to debug logs
  c.stdout.on('data', (data) => process.stdout.write(data));
  c.stderr.on('data', (data) => process.stderr.write(data));
  c.on('exit', (code) => cb(module, code));
};

const stopAllStarted = (afterAllStoppedCb = () => {}) => {
  let stoppedModules = 0;
  map(startedModules, (module) => stop(module, () => {
    stoppedModules++;
    if (stoppedModules === startedModules.length)
      afterAllStoppedCb();
  }));
};

const startModules = (modules, cb) => {
  map(modules, (module) => start(module));
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


module.exports = {
  modules,
  start,
  stop,
  startModules,
  stopAllStarted
};
