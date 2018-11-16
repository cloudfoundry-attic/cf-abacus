'use strict';

/* eslint-disable max-len*/
const webapp = require('./application');

const debug = require('abacus-debug')('abacus-dashboard');

const dashboard = () => {
  debug('Getting dashboard app');
  return webapp();
};

const startDashboard = () => {
  debug('Starting Dashboard App');
  dashboard().listen();
};

const runCLI = () => {
  startDashboard();
};

module.exports = dashboard;

runCLI();
