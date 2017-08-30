'use strict';

const _ = require('underscore');
const extend = _.extend;
const keys = _.keys;
const each = _.each;

const removeProperties = (obj) => {
  each(keys(obj), (key) => {
    delete obj[key];
  });
};

const stubbedModule = (name) => {
  const originalModule = require(name);
  const cachedModule = require.cache[require.resolve(name)];
  let delegateFunc = originalModule;
  cachedModule.exports = extend((...args) => {
    return delegateFunc(...args);
  }, originalModule);

  const funcStubber = {
    stubMainFunc: (func) => {
      delegateFunc = func;
      return funcStubber;
    },
    restoreMainFunc: () => {
      delegateFunc = originalModule;
      return funcStubber;
    },
    stubProperties: (properties) => {
      extend(cachedModule.exports, properties);
      return funcStubber;
    },
    clearProperties: () => {
      removeProperties(cachedModule.exports);
    },
    restoreProperties: () => {
      funcStubber.clearProperties();
      extend(cachedModule.exports, originalModule);
      return funcStubber;
    },
    restore: () => {
      funcStubber.restoreMainFunc();
      funcStubber.restoreProperties();
    },
    unstub: () => {
      delete require.cache[require.resolve(name)];
    }
  };
  return funcStubber;
};

const stubModule = (name, func, subFuncs = {}) => {
  require(name);
  require.cache[require.resolve(name)].exports = extend(
    func, subFuncs
  );
};

const unstubModule = (name) => {
  delete require.cache[require.resolve(name)];
};

module.exports = stubbedModule;
module.exports.stub = stubModule;
module.exports.unstub = unstubModule;
