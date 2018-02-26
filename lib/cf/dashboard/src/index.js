'use strict';

/* eslint-disable max-len*/
const cluster = require('abacus-cluster');
const webapp = require('./application');

const debug = require('abacus-debug')('abacus-dashboard');

const dashboard = () => {
  debug('Getting dashboard app');
  return webapp();
};

const startDashboard = () => {
  debug('Starting Dashboard App');
  cluster.singleton();
  dashboard().listen();
};

const runCLI = () => {
  startDashboard();
};

module.exports = dashboard;
module.exports.runCLI = runCLI;
