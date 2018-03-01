'use strict';

const amqp = require('amqp-connection-manager');
const ConnectionManager = require('../lib/connection-manager');

describe('ConnectionManager', () => {
  const sandbox = sinon.sandbox.create();
  const uris = ['uri1', 'uri2'];

  let connectionManager;

  beforeEach(() => {
    connectionManager = new ConnectionManager(uris);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('connect', () => {
    const setupFn = () => {};

    let waitForConnectStub;
    let fakeConnection;
    let fakeChannel;
    let channel;

    beforeEach(async() => {
      waitForConnectStub = sandbox.stub().callsFake((resolve, reject) => {
        resolve();
      });

      fakeChannel = {
        on: () => {},
        waitForConnect: () => new Promise(waitForConnectStub)
      };

      fakeConnection = {
        on: () => {},
        createChannel: () => {}
      };
      sandbox.stub(fakeConnection, 'createChannel').returns(fakeChannel);

      sandbox.stub(amqp, 'connect').returns(fakeConnection);

      channel = await connectionManager.connect(setupFn);
    });

    it('creates amqp connection', () => {
      assert.calledOnce(amqp.connect);
      assert.calledWith(amqp.connect, sinon.match(uris), sinon.match({
        json: true
      }));
    });

    it('create a channel', () => {
      assert.calledOnce(fakeConnection.createChannel);
      assert.calledWith(fakeConnection.createChannel, sinon.match({
        json: true,
        setup: setupFn
      }));
    });

    it('waits on channel to connect', () => {
      assert.calledOnce(waitForConnectStub);
    });

    it('returns channel', () => {
      expect(channel).to.equal(fakeChannel);
    });
  });
});
