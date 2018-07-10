'use strict';

const util = require('util');

module.exports = () => {
  const map = new Map();

  return {
    get: (key) => map.get(key),
    size: () => map.size,
    increment: (key) => map.set(key, map.get(key) ? map.get(key) + 1 : 1),
    decrement: (key) => {
      let value = map.get(key) ? map.get(key) - 1 : 0;
      if(value)
        map.set(key, value);
      else
        map.delete(key);
    },
    toString: () => util.inspect(map, false, null)
  };
};
