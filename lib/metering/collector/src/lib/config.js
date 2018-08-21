'use strict';

const { extend } = require('underscore');

module.exports.createCollectorConfiguration = (bufferConfig, getFromEnv) => {
  return extend({}, bufferConfig, { unsupportedLicenses: getFromEnv('UNSUPPORTED_LICENSES') ? 
    getFromEnv('UNSUPPORTED_LICENSES').split(',') : 
    [] });
};
