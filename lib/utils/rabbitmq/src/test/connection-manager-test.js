'use strict';

const amqp = require('amqp-connection-manager');
const rabbitMQ = require('../lib/connection-manager');

const assertConnection = (amqpStub, createChannelStub, uris) => {
  assert.calledWith(amqpStub, uris);
  assert.callOrder(amqpStub, createChannelStub);
};

describe('ConnectionManager', () => {

  context('constructor should', () => {

    const validUris = ['uri1', 'uri2'];
    const validQueueName = 'queue_name';

    const validateConnectionManagerCreation = (uris, queue) => {
      expect(() => new rabbitMQ.ConnectionManager(uris, queue)).to.throw();
    };

    it('set provided properties correctly', () => {
      const rabbitClient = new rabbitMQ.ConnectionManager(validUris, validQueueName);

      expect(validUris).to.deep.equal(rabbitClient.uris);
      expect(validQueueName).to.equal(rabbitClient.queueName);
    });

    it('throw when required uris argument is not provided', () => {
      validateConnectionManagerCreation(undefined, validQueueName);
    });

    it('throw when required uris argument is not an array', () => {
      validateConnectionManagerCreation('not array', validQueueName);
    });

    it('throw when required uris argument is empty array', () => {
      validateConnectionManagerCreation([], validQueueName);
    });

    it('throw when required queueName argument is not provided', () => {
      validateConnectionManagerCreation(validUris, undefined);
    });

    it('throw when required queueName argument is empty string', () => {
      validateConnectionManagerCreation(validUris, '');
    });

  });

  context('when connecting', () => {

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
      amqpStub = sandbox.stub(amqp, 'connect').withArgs(uris).onFirstCall().returns(connectionMock);
      rabbitClient = new rabbitMQ.ConnectionManager(uris, queueName);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('producer, calls connect method of amqp with valid arguments', () => {
      rabbitClient.connectProducer();

      assertConnection(amqpStub, createChannelStub, uris);
    });

    it('consumer, calls connect method of amqp with valid arguments', () => {
      rabbitClient.connectConsumer(() => {});

      assertConnection(amqpStub, createChannelStub, uris);
    });

    it('consumer, throws error when no message handler is provided', () => {
      expect(() => rabbitClient.connectConsumer()).to.throw();
    });

    it('consumer, throws error when no message handler is not a function', () => {
      expect(() => rabbitClient.connectConsumer('not-function')).to.throw();
    });
  });

});
