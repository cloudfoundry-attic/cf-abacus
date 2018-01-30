'use-strict';

/*

Provides functionality for starting and stopping abacus modules

Usage:
// Start and stop operations will inherit current process' enviornment
const lifecycleManager = require('abacus-lifecycle-manager')();
lifecycleManager.startModules([lifecycleManager.modules.renewer]);

// Provide custom enviornment for start and stop operations
const lifecycleManager = require('abacus-lifecycle-manager')().use({
  SOME_VAR: 1
});
lifecycleManager.startModules([lifecycleManager.modules.renewer]);

// Stops all modules previously started with this instance of abacus-lifecycle-manager
lifecycleManager.stopAllStarted()

Note: As startModules() will asynchronously start the given modules,
      its client will have to manually check if the start is finished
      (whatever that means for the module being started).

*/

const _ = require('underscore');
const clone = _.clone;
const forEach = _.forEach;

const debug = require('abacus-debug')('abacus-lifecycle-manager');
const cp = require('child_process');

const modules = {
  authServerPlugin: 'abacus-authserver-plugin',
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

const getModuleDir = (module) => {
  const path = require.resolve(module);
  return path.substr(0, path.indexOf(module + '/') + module.length);
};

const start = (module, env) => {
  const moduleDir = getModuleDir(module);
  debug(`Executing "start" operation on module ${module} in ` + `directory ${moduleDir} with environment %o`, env);

  const c = cp.spawn('npm', ['run', 'start'], {
    cwd: moduleDir,
    env
  });

  c.stdout.pipe(process.stdout);
  c.stderr.pipe(process.stderr);
};

const stop = (module, env) => {
  const moduleDir = getModuleDir(module);
  debug('Executing "stop" operation on module "%s" in directory %s', module, moduleDir);

  const stopOperation = 'npm run stop';
  return cp.execSync(stopOperation, {
    cwd: moduleDir,
    env
  });
};

module.exports = () => {
  const startedModules = new Set();
  let env = clone(process.env);

  const startModules = (modules) => {
    if (!modules || modules.length === 0) return;

    forEach(modules, (module) => {
      debug('Starting %s ...', module);
      start(module, env);
      startedModules.add(module);
    });
  };

  const stopAllStarted = () => {
    if (startedModules.size === 0) return;

    startedModules.forEach((module) => {
      debug('Stopping %s ...', module);
      stop(module, env);
      startedModules.delete(module);
    });
  };

  return {
    modules,
    startModules,
    stopAllStarted,

    useEnv: (customEnv) => {
      env = customEnv;
      return {
        modules,
        startModules,
        stopAllStarted
      };
    }
  };
};
