'use strict';
const amqp = require('amqp-connection-manager');

const rabbitUri = 'amqp://localhost:5672';
const queueName = 'abacus-collect-queue';

// Handle an incomming message.
let onMessage = async(data) => {
  const message = JSON.parse(data.content.toString());
  console.log('receiver: got message', message);
  channelWrapper.ack(data);
};

// Create a connetion manager
let connection = amqp.connect([rabbitUri], { json: true });
connection.on('connect', function() {
  console.log('Connected!');
});
connection.on('disconnect', function(params) {
  console.log('Disconnected.', params.err.stack);
});

// Set up a channel listening for messages in the queue.
const channelWrapper = connection.createChannel({
  setup: (channel) => Promise.all([
    channel.assertQueue(queueName, { durable: true }),
    channel.prefetch(100),
    channel.consume(queueName, onMessage)
  ])
  // setup: onMessage

});

channelWrapper.waitForConnect()
  .then(function() {
    console.log('Listening for messages');
  });
