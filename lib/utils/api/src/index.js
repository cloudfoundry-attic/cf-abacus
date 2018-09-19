'use strict';

const { extend } = require('underscore');

module.exports = extend({},
  require('./lib/errors'),
  require('./lib/collector-client')
);
