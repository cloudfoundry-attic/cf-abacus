'use strict';

// Populates the application environment from an rc file.

const _ = require('underscore');
const rc = require('rc');

const map = _.map;
const keys = _.keys;

// Setup debug log
const debug = require('abacus-debug')('abacus-rc');

// Load an rc file into process.env
const load = (app) => {
  const conf = rc(app || 'app');
  if(!conf)
    return;
  const env = process.env.CONF || 'default';
  if(conf.configs)
    debug('Loaded rc files %o', conf.configs);
  const vars = env ? conf[env] : conf;
  map(keys(vars), (k) => {
    if(k !== 'config' && k !== 'configs' && process.env[k] === undefined) {
      debug('Setting env %s=%s', k, vars[k]);
      process.env[k] = vars[k];
    }
  });
};

// Export our public functions
module.exports = load;

