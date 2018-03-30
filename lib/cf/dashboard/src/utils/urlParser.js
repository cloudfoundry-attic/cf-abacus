'use strict';

const urlModule = require('url');

const parse = (url) => {
  return urlModule.parse(url);
};

const UrlParser = {
  getPath: (url) => {
    return parse(url).pathname;
  },
  getQuery: (url) => {
    return parse(url).query;
  }
};

module.exports = UrlParser;
