'use strict';

// Populates the application environment from an rc file.

const _ = require('underscore');
const rc = require('rc');
const strip = require('strip-json-comments')
const yaml = require('js-yaml');

const map = _.map;
const keys = _.keys;

/* eslint dot-notation: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-rc');

// Parse JSON and Yaml
const parse = (content) => {
  if(/^\s*{/.test(content))
    return JSON.parse(strip(content))
  return yaml.load(content);
};

// Set env variables from the given set
const setenv = (vars) => {
  map(keys(vars), (k) => {
    if(k !== '_' && k !== 'config' && k !== 'configs' &&
      process.env[k] === undefined && vars[k]) {
      debug('Setting env %s=%s', k, vars[k]);
      process.env[k] = vars[k];
    }
  });
};

// Load an rc file into process.env
const load = (name) => {
  const conf = rc(name || 'app', {}, null, parse);
  if(!conf)
    return;
  if(conf.configs)
    debug('Loaded rc files %o', conf.configs);

  setenv(conf['default']);
  if(process.env.CONF && process.env.CONF !== 'default')
    setenv(conf[process.env.CONF]);
};

// Export our public functions
module.exports = load;

