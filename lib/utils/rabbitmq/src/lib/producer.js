'use strict';

let cm;

class Producer {

  constructor(uris, queueName) {
    cm = new ConnectionManager(uris, queueName);
    cm.connectProducer();
  }

  send(msg) {
    cm.channelWrapper.sendToQueue(connectionManager.queueName, msg, { persistent: true });
  }
}

module.exports.Producer = Producer;
