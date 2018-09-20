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

const getAbacusDirPath = () => {
  const currentDirName = __dirname;
  const abacusProjectName = 'cf-abacus';
  const lastSymbolIndex = currentDirName.indexOf(abacusProjectName) + abacusProjectName.length;
  return `${currentDirName.substring(0, lastSymbolIndex)}`;
};

module.exports = {
  checkCorrectSetup,
  getAbacusDirPath
};
