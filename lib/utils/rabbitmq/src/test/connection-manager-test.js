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
    let waitForConnectStub;

    const uris = ['uri1', 'uri2'];

    const sandbox = sinon.sandbox.create();

    beforeEach(() => {
      waitForConnectStub = sandbox.stub().returns(Promise.resolve());
      createChannelStub = sandbox.stub().returns({
        on : sandbox.stub(),
        waitForConnect : waitForConnectStub
      });

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

    const itThrows = async(func, errMessage) => {
      let error;
      try {
        await func();
      } catch(err) {
        error = err.message;
      }
      expect(error).to.equal(errMessage);
    };

    it('errors with no setup function', async() => {
      await itThrows(connectionManager.connect, 'Invalid setup function');
    });

    it('errors with invalid setup function', async() => {
      await itThrows(() => connectionManager.connect('not a function'), 'Invalid setup function');
    });

    it('calls connect method of amqp', async() => {
      const setupFn = () => {};
      await connectionManager.connect(setupFn);

      expect(waitForConnectStub.callCount).to.equal(1);
      assert.callOrder(amqpStub, createChannelStub, waitForConnectStub);
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
      expect(connectionManager.connect(setupFn)).to.not.equal(undefined);
    });
  });
});
