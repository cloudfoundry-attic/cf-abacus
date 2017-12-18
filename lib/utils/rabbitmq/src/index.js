'use strict';

const producer = require('./lib/producer');
const consumer = require('./lib/consumer');
const connectionManager = require('./lib/connection-manager');

module.exports.Producer = producer;
module.exports.Consumer = consumer;
module.exports.ConnectionManager = connectionManager;
