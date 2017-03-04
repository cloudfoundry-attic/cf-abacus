// Easily rewire and patch CommonJS modules for testing

const { extend } = require('underscore');

// Rewire a module
const rewire = (name, exports) => {
  const module = require(name);
  require.cache[require.resolve(name)].exports =
    extend(exports.default || {}, module, exports);
};

module.exports = rewire;

