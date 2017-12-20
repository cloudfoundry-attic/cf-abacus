'use strict';

const _ = require('underscore');
const isArray = _.isArray;
const isEmpty = _.isEmpty;
const isFunction = _.isFunction;

const amqp = require('amqp-connection-manager');
const util = require('util');

const debug = require('abacus-debug')('abacus-rabbitmq');

class ConnectionManager {

  constructor(uris) {
    if(isEmpty(uris) || !isArray(uris))
      throw new Error(util.format('Invalid uris: %j', uris));
    this.uris = uris;

    // Bind the class functions to the object context.
    // The result is that function will always have 'this' set to class context.
    this.connect.bind(this);
  }

  connect(setupFn) {
    if(!isFunction(setupFn))
      throw new Error('Invalid setup function');

    const connection = amqp.connect(this.uris, { json: true });
    connection.on('connect',
      () => debug('Connected to RabbitMQ on %o', this.uris));
    connection.on('disconnect',
      (params) => debug('Disconnected from RabbitMQ on %o due to %o', this.uris, params.err.stack));

    return connection.createChannel({
      json: true,
      setup: setupFn
    });
  }
}

module.exports = ConnectionManager;
