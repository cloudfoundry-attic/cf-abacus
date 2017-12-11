'use strict';

let connectionManager;

class QueueManager {

  constructor(cm) {
    connectionManager = cm;
    connectionManager.connect();
  }

  send(msg) {
    connectionManager
      .channelWrapper
      .sendToQueue(connectionManager.queueName, msg, { persistent: true });
  }

};

module.exports.QueueManager = QueueManager;
