'use strict';

const amqp = require('amqp-connection-manager');
const ConnectionManager = require('../lib/connection-manager');

describe('ConnectionManager', () => {
  context('constructor', () => {
    const validUris = ['uri1', 'uri2'];
    const validQueueName = 'queue_name';

    it('sets provided properties correctly', () => {
      const connectionManager = new ConnectionManager(validUris, validQueueName);

      expect(connectionManager.uris).to.deep.equal(validUris);
    });

    it('throws when required uris argument is not provided', () => {
      expect(() => new ConnectionManager(undefined, validQueueName)).to.throw();
    });

    it('throws when required uris argument is not an array', () => {
      expect(() => new ConnectionManager('not array', validQueueName)).to.throw();
    });

    it('throws when required uris argument is an empty array', () => {
      expect(() => new ConnectionManager([], validQueueName)).to.throw();
    });
  });

  context('connect', () => {
    let amqpStub;
    let connectionManager;
    let createChannelStub;

    const uris = ['uri1', 'uri2'];

    const sandbox = sinon.sandbox.create();

    beforeEach(() => {
      createChannelStub = sandbox.stub().returns('channel');
      amqpStub = sandbox
        .stub(amqp, 'connect')
        .withArgs(uris)
        .onFirstCall()
        .returns({
          on: () => {},
          createChannel: createChannelStub
        });
      connectionManager = new ConnectionManager(uris);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('errors with no setup function', () => {
      expect(connectionManager.connect).to.throw('Invalid');
    });

    it('errors with invalid setup function', () => {
      expect(() => connectionManager.connect('not a function')).to.throw('Invalid');
    });

    it('calls connect method of amqp', () => {
      const setupFn = () => {};
      connectionManager.connect(setupFn);

      assert.callOrder(amqpStub, createChannelStub);
      assert.calledWith(
        createChannelStub,
        sinon.match({
          json: true,
          setup: setupFn
        })
      );
    });

    it('returns channel', () => {
      const setupFn = () => {};
      expect(connectionManager.connect(setupFn)).to.equal('channel');
    });
  });
});
