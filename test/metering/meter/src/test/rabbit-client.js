'use strict';
const amqp = require('amqplib');

module.exports.deleteQueue = async(queueName) => {
  try {
    const connection = await amqp.connect(process.env.RABBIT_URL);
    const channel = await connection.createConfirmChannel();
    await channel.deleteQueue(queueName);
  } catch(e) {
    console.log(e);
  }
};

module.exports.sendToQueue = async(queueName, message) => {
  try {
    const connection = await amqp.connect(process.env.RABBIT_URL);
    const channel = await connection.createConfirmChannel();
    await channel.assertQueue(queueName, { durable: true });
    await channel.sendToQueue(queueName, new Buffer(JSON.stringify(message)));
  } catch(e) {
    console.log(e);
  }
};
