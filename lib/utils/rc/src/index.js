'use strict';

// Populates the application environment from an rc file.

const _ = require('underscore');
const rc = require('rc');
const strip = require('strip-json-comments')
const yaml = require('js-yaml');

const map = _.map;
const keys = _.keys;

// Setup debug log
const debug = require('abacus-debug')('abacus-rc');

// Parse JSON and Yaml
const parse = (content) => {
  if(/^\s*{/.test(content))
    return JSON.parse(strip(content))
  return yaml.load(content);
};

// Load an rc file into process.env
const load = (app) => {
  const conf = rc(app || 'app', {}, null, parse);
  if(!conf)
    return;
  const env = process.env.CONF || 'default';
  if(conf.configs)
    debug('Loaded rc files %o', conf.configs);
  const vars = env ? conf[env] : conf;
  map(keys(vars), (k) => {
    if(k !== '_' &&
      k !== 'config' && k !== 'configs' && process.env[k] === undefined) {
      debug('Setting env %s=%s', k, vars[k]);
      process.env[k] = vars[k];
    }
  });
};

// Export our public functions
module.exports = load;

