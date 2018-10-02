'use strict';

const cmdline = require('abacus-cmdline');
const appUtil = require('./cf-app');
const serviceUtil = require('./cf-service');

module.exports = ({ api, user, password }) => {
  const cfUtils = cmdline.cfutils(api, user, password);
  return {
    App: appUtil(cfUtils),
    Service: serviceUtil(cfUtils)
  };
};
