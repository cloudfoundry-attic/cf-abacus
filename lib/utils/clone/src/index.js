'use strict';

// Utility that takes in an array or object and creates a deep copy

const _ = require('underscore');

// Setup debug log
const debug = require('abacus-debug')('abacus-clone');

const map = _.map;
const mapObject = _.mapObject;
const isObject = _.isObject;
const isArray = _.isArray;

const defaultInterceptor = (v, k) => {
  return v;
};

// Traverses through an array or object and applies the given function on
// every single property
const traverseAndIntercept = (o, interceptor) => {
  const interceptEach = (v, k) => {
    return traverseAndIntercept(interceptor(v, k), interceptor);
  };
  if(isArray(o))
    return map(o, interceptEach);
  if(isObject(o))
    return mapObject(o, interceptEach);
  return o;
};

// Parses through the object applying the interceptor
// function for every single property
const clone = (o, interceptor) => {
  const i = interceptor || defaultInterceptor;
  debug('Cloning %o', o);
  return traverseAndIntercept(i(o), i);
};

// Export our public functions
module.exports = clone;
