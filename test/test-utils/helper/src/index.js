'use strict';

const { pairs, every } = require('underscore');

const insufficientSetUp = (env) => {
  let unsetProperty;
  let allPropertiesAreSet = every(pairs(env), (pair) => {
    unsetProperty = pair[0];
    return typeof pair[1] !== 'undefined';
  });
  return allPropertiesAreSet ? undefined : unsetProperty;
};

const checkCorrectSetup = (env) => {
  if (insufficientSetUp(env))
    throw new Error(
      'This test cannot run without correct set up. Please check if all environment variables are set. ' +
      `Check ${insufficientSetUp(env)}.`);
};

module.exports = {
  checkCorrectSetup
};
