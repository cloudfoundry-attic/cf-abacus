'use strict';

const { extend } = require('underscore');

const fromEnv = {
  unsupportedLicenses: process.env.UNSUPPORTED_LICENSES ? process.env.UNSUPPORTED_LICENSES.split(',') : undefined
};

module.exports.createCollectorConfiguration = (bufferConfig) => {
  return extend({}, bufferConfig, { unsupportedLicenses: fromEnv.unsupportedLicenses || []});
};
