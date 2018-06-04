'use strict';

const lru = require('abacus-lrucache');

// Maintain a cache of accounts
const elements = lru({
  max: 10000,
  maxAge: 1000 * 60 * 20
});

const find = (k) => {
  return elements.get(k);
};

const cache = (k, element) => {
  elements.set(k, element);
  return element;
};

module.exports = () => {
  return {
    find,
    cache
  };
};
