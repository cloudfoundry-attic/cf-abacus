'use strict';

const _ = require('underscore');
const isArray = _.isArray;
const isString = _.isString;
const isEmpty = _.isEmpty;
const isFunction = _.isFunction;

const amqp = require('amqp-connection-manager');

const prefetchLimit = process.env.PREFETCH_LIMIT ? process.env.PREFETCH_LIMIT : 100;

let _uris;
let _queueName;
let _channelWrapper;

const basicSetup = (channel) =>
  channel.assertQueue(_queueName, { durable: true });

const consumerSetup = (msgHandle) => (channel) =>
  Promise.all([
    channel.assertQueue(_queueName, { durable: true }),
    channel.prefetch(prefetchLimit),
    channel.consume(q, msgHandle)
  ]);

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
    if(isEmpty(uris) || !isArray(uris))
      throw new Error('Parameter uris is not valid');

    if(isEmpty(queueName) || !isString(queueName))
      throw new Error('Parameter queueName is not valid');

    _uris = uris;
    _queueName = queueName;

    // TODO: be sure about this
    // Object.seal(this);
  }

  connectProducer() {
    const connection = amqp.connect(this.uris);
    _channelWrapper = connection.createChannel({
      json: true,
      setup: basicSetup
    });
  }

  connectConsumer(msgHandle) {
    if(!msgHandle)
      throw new Error('No message handler is provided');

    if(!isFunction(msgHandle))
      throw new Error('Provided message handler is not a function');

    const connection = amqp.connect(this.uris);
    _channelWrapper = connection.createChannel({
      json: true,
      setup: consumerSetup(msgHandle)
    });
  }

}

module.exports.ConnectionManager = ConnectionManager;
