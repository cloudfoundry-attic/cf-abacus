'use strict';

const Consumer = require('../lib/consumer');
const ConnectionManager = require('../lib/connection-manager');

const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const queueName = 'queueName';

describe('Consumer', () => {
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

  describe('constructor', () => {
    context('with invalid parameters', () => {
      it('throws without connection manager', () => {
        expect(() => new Consumer()).to.throw();
      });

      it('throws with manager that has no connect function', () => {
        expect(() => new Consumer({})).to.throw('Invalid');
      });

      it('throws without queueName', () => {
        expect(() => new Consumer(connectionManager, undefined)).to.throw('Invalid');
      });

      it('throws with queueName an empty string', () => {
        expect(() => new Consumer(connectionManager, '')).to.throw('Invalid');
      });

      it('throws without handler', () => {
        expect(() => new Consumer(connectionManager, queueName)).to.throw('function');
      });

      it('throws with handler that is not a function', () => {
        expect(() => new Consumer(connectionManager, queueName, '')).to.throw('function');
      });
    });

    context('with valid parameters', () => {
      let consumer;
      const msgHandlerSpy = sandbox.spy();

      beforeEach(() => {
        consumer = new Consumer(connectionManager, queueName, msgHandlerSpy);
      });

      it('calls manager connect', () => {
        assert.calledOnce(connectStub);
      });

      it('sets provided properties', () => {
        expect(consumer.queueName).to.equal(queueName);
        expect(consumer.channel).not.to.equal(undefined);
      });

      it('sets up durable queue', () => {
        const setupFn = connectStub.firstCall.args[0];

        const queueStub = sinon.stub();
        const prefetchStub = sinon.stub();
        const consumeStub = sinon.stub();
        const channel = {
          assertQueue: queueStub,
          prefetch: prefetchStub,
          consume: consumeStub
        };

        setupFn(channel);

        assert.calledWith(queueStub, queueName, { durable: true });
        assert.calledWith(prefetchStub, 100);
        assert.calledWith(consumeStub, queueName, msgHandlerSpy);
      });
    });
  });

  describe('ack', () => {
    let consumer;
    let ackStub;

    beforeEach(() => {
      ackStub = sandbox.stub().yields();
      const channelMock = {
        ack: ackStub
      };
      connectStub.returns(channelMock);

      const msgHandlerSpy = sandbox.spy();
      consumer = new Consumer(connectionManager, queueName, msgHandlerSpy);
    });

    it('calls channel ack', functioncb(function*() {
      yield consumer.ack('message');
      assert.calledWith(ackStub, 'message');
    }));
  });

  describe('nack', () => {
    let consumer;
    let nackStub;

    beforeEach(() => {
      nackStub = sandbox.stub().yields();
      const channelMock = {
        nack: nackStub
      };
      connectStub.returns(channelMock);

      const msgHandlerSpy = sandbox.spy();
      consumer = new Consumer(connectionManager, queueName, msgHandlerSpy);
    });

    it('calls channel nack', functioncb(function*() {
      yield consumer.nack('message');
      assert.calledWith(nackStub, 'message');
    }));
  });

});
