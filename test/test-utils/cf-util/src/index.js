'use strict';

const cmdline = require('abacus-cmdline');
const appUtil = require('./cf-app');
const serviceUtil = require('./cf-service');

module.exports = ({ api, user, password, origin }) => {
  const cfUtils = cmdline.cfutils(api, user, password, origin);
  return {
    App: appUtil(cfUtils),
    Service: serviceUtil(cfUtils)
  };
};
