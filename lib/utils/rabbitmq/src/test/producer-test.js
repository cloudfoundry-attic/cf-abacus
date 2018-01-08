'use strict';

const Producer = require('../lib/producer');
const ConnectionManager = require('../lib/connection-manager');

const queueName = 'queueName';

describe('Producer', () => {
  let connectStub;
  let connectionManager;

  const sandbox = sinon.sandbox.create();

  beforeEach(() => {
    connectionManager = new ConnectionManager(['uri']);
    connectStub = sandbox.stub(connectionManager, 'connect').returns('channel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    context('with invalid parameters', () => {
      it('throws without connection manager', () => {
        expect(() => new Producer()).to.throw();
      });

      it('throws with manager that has no connect function', () => {
        expect(() => new Producer({})).to.throw('Invalid');
      });

      it('throws without queueName', () => {
        expect(() => new Producer(connectionManager, undefined)).to.throw('Invalid');
      });

      it('throws with queueName an empty string', () => {
        expect(() => new Producer(connectionManager, '')).to.throw('Invalid');
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
        expect(producer.queueName).to.equal(queueName);
        expect(producer.channel).to.equal('channel');
      });

      it('sets durable queue', () => {
        const setupFn = connectStub.firstCall.args[0];
        const queueStub = sinon.stub();
        const channel = {
          assertQueue: queueStub
        };

        setupFn(channel);

        assert.calledWith(queueStub, queueName, { durable: true });
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
      sendToQueueStub = sandbox.stub();

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

    it('sends persistent messages', async() => {
      await producer.send(message);

      assert.calledOnce(sendToQueueStub);
      assert.calledWith(sendToQueueStub, queueName, message, { persistent: true });
    });
  });

  describe('close', () => {
    let producer;
    let closeStub;

    beforeEach(() => {
      closeStub = sandbox.stub();

      const connectionManager = new ConnectionManager(['uri'], queueName);
      sandbox.stub(connectionManager, 'connect').returns({
        close: closeStub
      });

      producer = new Producer(connectionManager, queueName);
    });

    it('calls channel close', async() => {
      await producer.close();
      assert.calledOnce(closeStub);
    });
  });
});
