// Easily rewire and patch CommonJS modules for testing

import { extend } from 'underscore';

// Rewire a module
export const rewire = (name, exports) => {
  const module = require(name);
  require.cache[require.resolve(name)].exports =
    extend(exports.default || {}, module, exports);
};

export default rewire;

