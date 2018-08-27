'use strict';

const { bind } = require('underscore');

const amqp = require('amqp-connection-manager');

const debug = require('abacus-debug')('abacus-rabbit-connection-manager');
const edebug = require('abacus-debug')('e-abacus-rabbit-connection-manager');

class ConnectionManager {

  constructor(uris) {
    this.uris = uris;
  }

  async connect(setupFn) {
    const connection = amqp.connect(this.uris, { json: true });
    connection.on('connect', bind(this.onConnect, this));
    connection.on('disconnect', bind(this.onDisconnect, this));

    const channel = connection.createChannel({
      json: true,
      setup: setupFn
    });
    channel.on('connect', bind(this.onChannelConnect, this));
    channel.on('error', bind(this.onChannelError, this));
    channel.on('close', bind(this.onChannelClose, this));
    await channel.waitForConnect();

    return channel;
  }

  onConnect({ url }) {
    debug('Connected to RabbitMQ on %o', url);
  }

  onDisconnect({ err }) {
    if (err)
      edebug('Disconnected from RabbitMQ on "%o", error %o', this.uris, err);
    else
      debug('Disconnected from RabbitMQ on "%o"', this.uris);
  }

  onChannelConnect() {
    debug('Channel is connected');
  }

  onChannelError(err, { name }) {
    edebug('Channel could not connect, error %o', err);
  }

  onChannelClose() {
    debug('Channel closed');
  }
}

module.exports = ConnectionManager;
