'use strict';

const { extend } = require('underscore');

module.exports.createCollectorConfiguration = (bufferConfig, envReader) => {
  return extend({}, bufferConfig, {
    unsupportedLicenses: envReader.readArray('UNSUPPORTED_LICENSES', [])
  });
};
