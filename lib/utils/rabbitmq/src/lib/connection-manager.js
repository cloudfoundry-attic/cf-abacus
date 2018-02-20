'use strict';

const { isEmpty, isArray, isFunction } = require('underscore');
const amqp = require('amqp-connection-manager');
const util = require('util');

const debug = require('abacus-debug')('abacus-rabbit-connection-manager');
const edebug = require('abacus-debug')('e-abacus-rabbit-connection-manager');

class ConnectionManager {

  constructor(uris) {
    if(isEmpty(uris) || !isArray(uris)) {
      edebug('Invalid uris %j', uris);
      throw new Error(util.format('Invalid uris: %j', uris));
    }
    this.uris = uris;
  }

  async connect(setupFn) {
    if(!isFunction(setupFn)) {
      edebug('Invalid setup function');
      throw new Error('Invalid setup function');
    }

    const connection = amqp.connect(this.uris, { json: true });
    connection.on('connect', () => debug('Connected to RabbitMQ on %o', this.uris));
    connection.on('disconnect',
      (params) => debug('Disconnected from RabbitMQ on %o due to %o', this.uris, params.err.stack));

    const channel = connection.createChannel({
      json: true,
      setup: setupFn
    });
    channel.on('connect', () => debug('Channel wrapper is created'));
    channel.on('error', () => edebug('Could not create channel wrapper'));
    channel.on('close', () => debug('Channel wrapper closed'));

    await channel.waitForConnect();
    return channel;
  }
}

module.exports = ConnectionManager;
