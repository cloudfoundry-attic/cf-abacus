'use strict';

const { throttledClient } = require('../lib/throttler');
const { TooManyRequestsError } = require('../lib/errors');
const moment = require('abacus-moment');

class Condition {
  constructor() {
    const that = this;
    this.promise = new Promise((resolve) => {
      that.resolve = resolve;
    });
  }

  async done() {
    this.resolve();
  }

  async wait() {
    await this.promise;
  }
};

describe('throttler', () => {
  let originalClient;
  let client;
  let clock;

  let callServiceStub;

  class OriginalClient {
    constructor(stub) {
      this.stub = stub;
    }

    async callService(...args) {
      return await this.stub(...args);
    }
  }

  beforeEach(() => {
    clock = sinon.useFakeTimers(moment.now());
    callServiceStub = sinon.stub();
    originalClient = new OriginalClient(callServiceStub);
    client = throttledClient(originalClient);
  });

  afterEach(() => {
    clock.restore();
  });

  it('forwards arguments and returns result', async () => {
    callServiceStub.callsFake(async (a, b) => {
      return 'some result';
    });

    const result = await client.callService(1, 4);
    expect(result).to.equal('some result');
    assert.calledOnce(callServiceStub);
    assert.calledWithExactly(callServiceStub, 1, 4);
  });

  context('when client reports an too many requests error', async () => {
    const retryAfter = 10; // seconds

    beforeEach(() => {
      callServiceStub.callsFake(async () => {
        throw new TooManyRequestsError(retryAfter);
      });
    });

    it('sleeps the necessary time for the second request', async () => {
      await expect(client.callService()).to.be.rejected;

      const methodCalledCondition = new Condition();
      callServiceStub.callsFake(async () => {
        await methodCalledCondition.done();
      });

      client.callService();
      assert.calledOnce(callServiceStub);

      clock.tick(5000);
      assert.calledOnce(callServiceStub);

      clock.tick(5001);
      await methodCalledCondition.wait();
      assert.calledTwice(callServiceStub);
    });

    it('does not sleeps if sufficient time has elapsed', async () => {
      await expect(client.callService()).to.be.rejected;

      clock.tick(10001);

      const methodCalledCondition = new Condition();
      callServiceStub.callsFake(async () => {
        await methodCalledCondition.done();
      });
      client.callService();

      await methodCalledCondition.wait();
    });
  });
});
