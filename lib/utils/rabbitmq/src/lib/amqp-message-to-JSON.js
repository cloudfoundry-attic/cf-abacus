'use strict';

const debug = require('abacus-debug')('abacus-amqp-message-to-json');
const edebug = require('abacus-debug')('e-abacus-amqp-message-to-json');

module.exports = {
  toJSON: (rabbitMsg) => {
    try {
      debug('Parsing rabbitMQ message ...');
      return JSON.parse(rabbitMsg.content.toString());
    } catch(err) {
      edebug('Parsing rabbitMsg content error: %o', err.message);
      throw new Error('Parsing rabbitMQ message content error');
    }
  },
  toRabbitMessage: (json) => new Buffer(JSON.stringify(json))
};
