'use strict';

const { extend } = require('underscore');

module.exports = extend({},
  require('./lib/errors'),
  require('./lib/throttler'),
  require('./lib/collector-client')
);
