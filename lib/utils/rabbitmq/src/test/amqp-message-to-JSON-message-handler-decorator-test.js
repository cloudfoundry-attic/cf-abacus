'use strict';

const createDecorator = require('../lib/amqp-message-to-JSON-message-handler-decorator');

describe('Amqp message to JSON message handler decorator', () => {
  const sandbox = sinon.sandbox.create();

  context('when succesfully parsing message to JSON', () => {
    let message;
    let messageHandler;
    let decorator;

    beforeEach(() => {
      message = { content: '{ "is-valid-JSON": "yes" }' };
      messageHandler = { handle: sandbox.stub().returns(Promise.resolve()) };
      decorator = createDecorator(messageHandler);
    });

    it('should send message to handler', async() => {
      await assertPromise.isFulfilled(decorator.handle(message))
        .then(assert.calledOnce(messageHandler.handle))
        .then(assert.calledWith(messageHandler.handle, JSON.parse(message.content.toString())));
    });
  });

  context('when unsuccesfully parsing message to JSON', () => {
    let message;
    let decorator;
    let messageHandler;

    beforeEach(() => {
      message = { content: '{ is-valid-JSON: no }' };
      messageHandler = { handle: sandbox.stub() };
      decorator = createDecorator(messageHandler);
    });

    it('should throw', () => {
      expect(() => decorator.handle(message)).to.throw('Parsing message content error');
      assert.notCalled(messageHandler.handle);
    });
  });
});
