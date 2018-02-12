'use-strict';

const cmdline = require('abacus-cmdline');

module.exports = {
  cf: ({ api, user, password }) => {
    const cfUtils = cmdline.cfutils(api, user, password);
    return {
      App: require('./cf-app')(cfUtils),
      Service: require('./cf-service')(cfUtils)
    };
  },
  abacusClient: require('./abacus-client')
};
