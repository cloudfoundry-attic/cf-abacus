'use strict';

const cmdline = require('abacus-cmdline');

module.exports = ({ api, user, password }) => {
  const cfUtils = cmdline.cfutils(api, user, password);
  return {
    App: require('./cf-app')(cfUtils),
    Service: require('./cf-service')(cfUtils)
  };
};
