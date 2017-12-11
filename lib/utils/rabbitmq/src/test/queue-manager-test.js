'use strict';

const QueueManager = require('../lib/queue-manager').QueueManager;
const ConnectionManager = require('../lib/connection-manager').ConnectionManager;

describe('RabbitMQQueueManager', () => {

  const sandbox = sinon.sandbox.create();

  let connectionManager;
  let connectStub;
  let queueManager;

  before(() => {
    connectionManager = new ConnectionManager(['uri1'], 'queueName');
    connectStub = sandbox.stub(connectionManager, 'connect').returns();
  });

  beforeEach(() => {
    queueManager = new QueueManager(connectionManager);
  });

  afterEach(() => {
    sandbox.reset();
  });

  it('constructor should call connect method of connection manager', () => {
    expect(connectStub.calledOnce).to.equal(true);
  });


  it('should send message', (done) => {
    const testMsg = 'message';
    const sendStub = sandbox.stub(queueManager, 'send').yields();

    queueManager.send(testMsg, (err, res) => {
      expect(sendStub.calledOnce).to.equal(true);
      assert.calledWith(sendStub, testMsg);
      assert.callOrder(connectStub, sendStub);
      done();
    });

  });

});
