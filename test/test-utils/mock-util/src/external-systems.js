'use strict';

const async = require('async');
const { extend } = require('underscore');

module.exports = (creators) => {
  let result;

  const externalSystemsMocks = () => {
    if (result) 
      return result;

    const serverMocks = Object.keys(creators).reduce((accumulated, key) => {
      accumulated[key] = creators[key]();
      return accumulated;
    }, {});

    result = {
      startAll: () => {
        Object.keys(serverMocks).forEach((key) => serverMocks[key].start());
      },
      stopAll: (done) => {
        async.forEach(Object.keys(serverMocks), (key, stopped) => serverMocks[key].stop(stopped), done);
      }
    };

    extend(result, serverMocks);
    return result;
  };

  return externalSystemsMocks;
};
