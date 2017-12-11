

'use strict';

class Producer {
  constructor(uris, queueName) {
    qm = new QueueManager(new ConnectionManager(uris, queueName));
  }
}

module.exports.Producer = Producer;
