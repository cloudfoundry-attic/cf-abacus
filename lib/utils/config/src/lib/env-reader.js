'use strict';

const getFromEnv = (envVar) => {
  return process.env[envVar];
};

module.exports.envReader = getFromEnv;
