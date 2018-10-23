'use strict';

const { extend } = require('underscore');

module.exports = extend({},
  require('./lib/errors'),
  require('./lib/throttler'),
  require('./lib/auth-header-provider'),
  require('./lib/collector-client'),
  require('./lib/provisioning-client'),
  require('./lib/receiver-client'),
  require('./lib/webapp-client')
);
