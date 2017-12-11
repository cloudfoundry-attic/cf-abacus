'use strict';

const amqp = require('amqp-connection-manager');

let _uris;
let _queueName;
let _channelWrapper;

class ConnectionManager {

  get uris() {
    return _uris;
  }

  get queueName() {
    return _queueName;
  }

  get channelWrapper() {
    return _channelWrapper;
  }

  constructor(uris, queueName) {
    if(!uris || !Array.isArray(uris))
      throw new Error('Parameter uris is not valid');

    if(typeof queueName !== 'string' || !queueName.length)
      throw new Error('Parameter queueName is not valid');

    _uris = uris;
    _queueName = queueName;

    // TODO: be sure about this
    // Object.seal(this);
  }

  connect() {
    const connection = amqp.connect(this.uris);
    _channelWrapper = connection.createChannel({
      json: true,
      setup: function(channel) {
        return channel.assertQueue(_queueName, { durable: true });
      }
    });
  }

}

module.exports.ConnectionManager = ConnectionManager;
