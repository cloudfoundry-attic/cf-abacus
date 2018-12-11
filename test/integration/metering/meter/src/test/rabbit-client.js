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

module.exports.messagesCount = async(...queueNames) => {
  const connection = await amqp.connect(process.env.RABBIT_URL);
  const channel = await connection.createConfirmChannel();
  let messagesCount = 0;
  for(let queueName of queueNames) {
    const res = await channel.checkQueue(queueName);
    messagesCount += res.messageCount;
  }
  return messagesCount;
};


