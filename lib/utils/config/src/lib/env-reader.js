'use strict';

const arrayDelimiter = ',';

const read = (varName, defaultValue, parseFn) => {
  const value = process.env[varName];
  if (!value)
    return defaultValue;

  return parseFn(value);
};

const readString = (varName, defaultValue) => {
  return read(varName, defaultValue, (value) => value);
};

const readInt = (varName, defaultValue) => {
  return read(varName, defaultValue, (value) => parseInt(value));
};

const readArray = (varName, defaultValue) => {
  return read(varName, defaultValue, (value) => value.split(arrayDelimiter));
};

module.exports.envReader = {
  readString,
  readInt,
  readArray
};
