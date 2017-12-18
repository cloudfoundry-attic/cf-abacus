'use strict';

const Producer = require('../lib/producer');
const ConnectionManager = require('../lib/connection-manager');

const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const queueName = 'queueName';

describe('Producer', () => {
  describe('constructor', () => {
    const sandbox = sinon.sandbox.create();

    let connectStub;
    let connectionManager;

    beforeEach(() => {
      connectionManager = new ConnectionManager(['uri']);
      connectStub = sandbox.stub(connectionManager, 'connect');
    });

    afterEach(() => {
      sandbox.restore();
    });

    context('with invalid parameters', () => {
      it('errors without connection manager', () => {
        expect(() => new Producer()).to.throw();
      });

      it('errors with manager that has no connect function', () => {
        expect(() => new Producer({})).to.throw('Invalid');
      });

      it('throws when required queueName argument is not provided', () => {
        expect(() => new Producer(connectionManager, undefined)).to.throw();
      });

      it('throws when required queueName argument is an empty string', () => {
        expect(() => new Producer(connectionManager, '')).to.throw();
      });
    });

    context('with valid parameters', () => {
      let producer;

      beforeEach(() => {
        producer = new Producer(connectionManager, queueName);
      });

      it('calls manager connect', () => {
        assert.calledOnce(connectStub);
      });

      it('sets provided properties', () => {
        expect(producer.connectionManager).to.equal(connectionManager);
        expect(producer.queueName).to.equal(queueName);
      });

      it('sets durable queue', () => {
        const setupFn = connectStub.firstCall.args[0];
        const assertQueueStub = sinon.stub();
        const channel = {
          assertQueue: assertQueueStub
        };

        setupFn(channel);

        assertQueueStub.calledWith(assertQueueStub, queueName, { durable: true });
      });
    });
  });

  describe('send', () => {
    const sandbox = sinon.sandbox.create();

    const queueName = 'queueName';
    const message = 'message';

    let producer;
    let sendToQueueStub;

    beforeEach(() => {
      sendToQueueStub = sandbox.stub().yields();

      const connectionManager = new ConnectionManager(['uri'], queueName);
      const connectStub = sandbox.stub(connectionManager, 'connect').returns({
        sendToQueue: sendToQueueStub
      });
      sandbox.stub(connectStub, 'on');

      producer = new Producer(connectionManager, queueName);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('sends persistent messages', functioncb(function*() {
      yield producer.send(message);

      assert.calledOnce(sendToQueueStub);
      assert.calledWith(sendToQueueStub, queueName, message, { persistent: true });
    }));
  });
});
