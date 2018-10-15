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

module.exports = (env) => {
  const insufficientEnvironmentVariable = insufficientSetup(env);
  if (insufficientEnvironmentVariable)
    throw new Error(`Incorrect test set up. Check "${insufficientEnvironmentVariable}" environment variable.`);
};
