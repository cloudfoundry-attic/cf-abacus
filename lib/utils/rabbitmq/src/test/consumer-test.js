'use strict';

const Consumer = require('../lib/consumer');
const ConnectionManager = require('../lib/connection-manager');

const queueName = 'queueName';

describe('Consumer', () => {

  let sandbox;

  let msgHandlerSpy;
  let connectStub;
  let connectionManager;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    msgHandlerSpy = sandbox.spy();
    connectionManager = new ConnectionManager(['uri']);
    connectStub = sandbox.stub(connectionManager, 'connect').returns('channel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('constructor', () => {
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

      beforeEach(() => {
        consumer = new Consumer(connectionManager, queueName, msgHandlerSpy);
      });

      it('sets provided properties', () => {
        expect(consumer.connectionManager).to.deep.equal(connectionManager);
        expect(consumer.queueName).to.equal(queueName);
        expect(consumer.messageHandler).to.deep.equal(msgHandlerSpy);
      });
    });
  });

  context('methods', () => {
    let consumer;
    let ackStub;
    let nackStub;
    let closeStub;

    beforeEach(() => {

      ackStub = sandbox.stub();
      nackStub = sandbox.stub();
      closeStub = sandbox.stub();
      const channelMock = {
        ack: ackStub,
        nack: nackStub,
        close: closeStub
      };

      connectStub.returns(channelMock);
      consumer = new Consumer(connectionManager, queueName, msgHandlerSpy);
      consumer.consume();
    });

    context('consume', () => {

      it('calls manager connect', () => {
        assert.calledOnce(connectStub);
      });

      context('when setting up queue', () => {
        let queueStub;
        let prefetchStub;
        let consumeStub;

        beforeEach(() => {
          const setupFn = connectStub.firstCall.args[0];

          queueStub = sinon.stub();
          prefetchStub = sinon.stub();
          consumeStub = sinon.stub();
          const channel = {
            assertQueue: queueStub,
            prefetch: prefetchStub,
            consume: consumeStub
          };

          setupFn(channel);
        });

        it('sets up durable queue', () => {
          assert.calledWith(queueStub, queueName, { durable: true });
          assert.calledWith(prefetchStub, 100);
          assert.calledWith(consumeStub, queueName, msgHandlerSpy);
        });

        context('with custom prefetch limit', () => {
          before(() => {
            process.env.PREFETCH_LIMIT = 23;
          });

          it('uses custom limit', () => {
            assert.calledWith(prefetchStub, 23);
          });
        });
      });
    });

    context('ack', () => {

      it('calls channel ack', () => {

        consumer.ack('message');
        assert.calledWith(ackStub, 'message');
      });
    });

    context('nack', () => {

      it('calls channel nack', () => {
        consumer.nack('message');
        assert.calledWith(nackStub, 'message');
      });
    });

    context('close', () => {

      it('calls channel close', async() => {
        await consumer.close();
        assert.calledOnce(closeStub);
      });
    });
  });
});
