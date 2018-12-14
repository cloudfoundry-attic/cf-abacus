'use strict';

const { bind } = require('underscore');

const amqp = require('amqp-connection-manager');

const debug = require('abacus-debug')('abacus-rabbit-connection-manager');
const edebug = require('abacus-debug')('e-abacus-rabbit-connection-manager');

class ConnectionManager {

  constructor(uris) {
    this.uris = uris;
    this.channel = undefined;
  }

  async connect(setupFn) {
    const connection = amqp.connect(this.uris, { json: true });
    connection.on('connect', bind(this._onConnect, this));
    connection.on('disconnect', bind(this._onDisconnect, this));

    this.channel = connection.createChannel({
      json: true,
      setup: setupFn
    });
    this.channel.on('connect', bind(this._onChannelConnect, this));
    this.channel.on('error', bind(this._onChannelError, this));
    this.channel.on('close', bind(this._onChannelClose, this));
    await this.channel.waitForConnect();

    return this.channel;
  }

  async disconnect() {
    if (this.channel)
      await this.channel.close();
  }

  _onConnect({ url }) {
    debug('Connected to RabbitMQ on %o', url);
  }

  _onDisconnect({ err }) {
    if (err)
      edebug('Disconnected from RabbitMQ on "%o", error %o', this.uris, err);
    else
      debug('Disconnected from RabbitMQ on "%o"', this.uris);
  }

  _onChannelConnect() {
    debug('Channel is connected');
  }

  _onChannelError(err, { name }) {
    edebug('Channel could not connect, error %o', err);
  }

  _onChannelClose() {
    debug('Channel closed');
  }
}

module.exports = ConnectionManager;
