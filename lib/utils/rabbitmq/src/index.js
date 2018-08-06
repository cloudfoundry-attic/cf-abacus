'use strict';

module.exports.Producer = require('./lib/producer');
module.exports.Consumer = require('./lib/consumer');
module.exports.ConnectionManager = require('./lib/connection-manager');
module.exports.amqpMessageParser = require('./lib/amqp-message-to-JSON');
