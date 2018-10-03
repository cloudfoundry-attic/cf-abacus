'use strict';

const { pairs, every } = require('underscore');

const insufficientSetup = (env) => {
  let unsetProperty;
  let allPropertiesAreSet = every(pairs(env), (pair) => {
    unsetProperty = pair[0];
    return typeof pair[1] !== 'undefined';
  });
  return allPropertiesAreSet ? undefined : unsetProperty;
};

const checkCorrectSetup = (env) => {
  const insufficientEnvironmentVariable = insufficientSetup(env);
  if (insufficientEnvironmentVariable)
    throw new Error(
      'This test cannot run without correct set up. Please check if all environment variables are set. ' +
      `Check ${insufficientEnvironmentVariable}.`);
};

module.exports = {
  checkCorrectSetup
};
