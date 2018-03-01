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
    connectStub = sandbox.stub(connectionManager, 'connect').returns(Promise.resolve('channel'));
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('connect', () => {
    let producer;
    beforeEach(async() => {
      producer = new Producer(connectionManager, queueName);
      await producer.connect();
    });

    it('calls manager connect', () => {
      expect(connectStub.callCount).to.equal(1);
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

    it('fails when is not connected to channel', async() => {
      let errMessage;
      try {
        await producer.send(message);
      } catch(err) {
        errMessage = err.message;
      }
      expect(errMessage).to.equal('Producer is not connected! Use connect method first!');
    });

    it('sends persistent messages', async() => {
      await producer.connect();
      await producer.send(message);

      assert.calledOnce(sendToQueueStub);
      assert.calledWith(sendToQueueStub, queueName, message, { persistent: true });
    });

  });

  describe('close', () => {
    let producer;
    let closeStub;

    beforeEach(async() => {
      closeStub = sandbox.stub().returns(Promise.resolve());

      const connectionManager = new ConnectionManager(['uri'], queueName);
      sandbox.stub(connectionManager, 'connect').returns({
        close: closeStub
      });

      producer = new Producer(connectionManager, queueName);
    });

    it('calls channel close', async() => {
      await producer.connect();
      await producer.close();
      assert.calledOnce(closeStub);
    });
  });
});
