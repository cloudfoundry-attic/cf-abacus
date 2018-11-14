'use strict';

const { extend } = require('underscore');

module.exports = extend({},
  require('./lib/throttler'),
  require('./lib/errors'),
  require('./lib/auth-header-providers/header-creation-error'),
  require('./lib/auth-header-providers/basic-auth-header-provider'),
  require('./lib/auth-header-providers/bearer-auth-header-provider'),
  require('./lib/auth-header-providers/void-auth-header-provider'),
  require('./lib/clients/collector-client'),
  require('./lib/clients/provisioning-client'),
  require('./lib/clients/receiver-client'),
  require('./lib/clients/webapp-client'),
  require('./lib/clients/reporting-client'),
  require('./lib/clients/service-mapping-client')
);
