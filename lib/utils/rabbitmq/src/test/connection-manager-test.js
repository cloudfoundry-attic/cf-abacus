'use strict';

const amqp = require('amqp-connection-manager');
const rabbitMQ = require('../lib/connection-manager');

describe('ConnectionManager', () => {

  context('constructor should', () => {
    const validUris = ['uri1', 'uri2'];
    const validQueueName = 'queue_name';
    const validateConnectionManagerCreation = (uris, queue) => {
      expect(() => new rabbitMQ.ConnectionManager(uris, queue))
        .to.throw();
    };

    it('set provided properties correctly', () => {
      const rabbitClient =
        new rabbitMQ.ConnectionManager(validUris, validQueueName);

      expect(validUris).to.deep.equal(rabbitClient.uris);
      expect(validQueueName).to.equal(rabbitClient.queueName);
    });

    it('throw when required uris argument is not provided', () => {
      validateConnectionManagerCreation(undefined, validQueueName);
    });

    it('throw when required uris argument is not an array', () => {
      validateConnectionManagerCreation('not array', validQueueName);
    });

    it('throw when required queueName argument is not provided', () => {
      validateConnectionManagerCreation(validUris, undefined);
    });

    it('throw when required queueName argument is empty string', () => {
      validateConnectionManagerCreation(validUris, '');
    });
  });

  context('connect should', () => {
    let sandbox;
    let amqpStub;
    let rabbitClient;
    let connectionMock;
    let createChannelStub;

    const queueName = 'queue';
    const uris = ['uri1', 'uri2'];

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      createChannelStub = sandbox.stub();
      connectionMock = {
        createChannel: createChannelStub
      };
      amqpStub = sandbox.stub(amqp, 'connect')
        .withArgs(uris)
        .onFirstCall()
        .returns(connectionMock);
      rabbitClient =
        new rabbitMQ.ConnectionManager(uris, queueName);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('call connect method of amqp with valid arguments', () => {
      rabbitClient.connect();

      expect(amqpStub.calledOnce).to.equal(true);
      expect(amqpStub.firstCall.args[0]).to.deep.equal(uris);
    });

    it('call createChannel method of channelWrapper', () => {
      rabbitClient.connect();

      expect(createChannelStub.calledOnce).to.equal(true);
    });
  });

});
