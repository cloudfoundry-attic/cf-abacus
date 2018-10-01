'use strict';

const { values, every } = require('underscore');

const allValuesAreSet = (env) => {
  return every(values(env), (value) => {
    return typeof value !== 'undefined';
  });
};

const checkCorrectSetup = (env) => {
  if (!allValuesAreSet(env))
    throw new Error('This test cannot run without correct set up. Please check if all environment variables are set.');
};

module.exports = {
  checkCorrectSetup
};
