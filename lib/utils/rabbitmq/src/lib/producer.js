'use strict';

class Producer {

  constructor(connectionManager, queueName) {
    this.connectionManager = connectionManager;
    this.queueName = queueName;
  }

  async connect() {
    const setupFn =
      (channel) => channel.assertQueue(this.queueName, { durable: true });

    this.channel = await this.connectionManager.connect(setupFn);
  }

  async send(msg) {
    if (!this.channel)
      throw new Error('Producer is not connected! Use connect method first!');

    await this.channel.sendToQueue(
      this.queueName,
      msg,
      { persistent: true }
    );
  };

  async close() {
    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }
  }

}

module.exports = Producer;
