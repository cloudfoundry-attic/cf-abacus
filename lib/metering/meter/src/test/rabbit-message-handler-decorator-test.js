'use strict';

const createDecorator = require('../lib/rabbit-message-handler-decorator');

describe('message handler RabbitMQ decorator', () => {
  const sandbox = sinon.sandbox.create();

  context('when succesfully parsing message to JSON', () => {
    let message;
    let messageHandler;

    beforeEach(() => {
      message = { content: '{ "is-valid-JSON": "yes" }' };
      messageHandler = { handle: sandbox.stub().returns(Promise.resolve()) };
      createDecorator(messageHandler).handle(message);
    });

    it('should send parsed message to handler', () => {
      assert.calledOnce(messageHandler.handle);
      assert.calledWith(messageHandler.handle, JSON.parse(message.content.toString()));
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
