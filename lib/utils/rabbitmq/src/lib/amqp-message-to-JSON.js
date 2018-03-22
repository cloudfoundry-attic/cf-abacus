'use strict';

const debug = require('abacus-debug')('abacus-amqp-message-to-json');
const edebug = require('abacus-debug')('e-abacus-amqp-message-to-json');

const amqpMessageToJSON = (messageHandler) => {
  const handle = (message) => {
    let usageDoc;

    try{
      debug('Parsing message ...');
      usageDoc = JSON.parse(message.content.toString());
    } catch(err) {
      edebug('Parsing message content error: %o', err.message);
      throw new Error('Parsing message content error');
    }

    return messageHandler.handle(usageDoc);
  };

  return {
    handle
  };
};

module.exports = amqpMessageToJSON;
