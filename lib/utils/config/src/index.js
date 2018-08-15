'use strict';

const { envReader } = require('./lib/env-reader');

const { bufferConfig } = require('./lib/buffer-config');

module.exports.bufferConfig = bufferConfig(envReader);
