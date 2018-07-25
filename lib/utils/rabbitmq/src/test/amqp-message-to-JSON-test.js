'use strict';

const parser = require('../lib/amqp-message-to-JSON');

describe('Amqp message to JSON message handler decorator', () => {
  let message;

  context('when successfully parsing message to JSON', () => {
    beforeEach(() => {
      message = { content: '{ "valid": "yes" }' };
    });

    it('should return parsed message', () => {
      expect(parser.toJSON(message)).to.deep.equal({ valid: 'yes' });
    });
  });

  context('when unsuccesfully parsing message to JSON', () => {
    beforeEach(() => {
      message = { content: '{ valid: no }' };
    });

    it('should throw', () => {
      expect(() => parser.toJSON(message)).to.throw('Parsing rabbitMQ message content error');
    });
  });

  context('when parsing json to rabbit message', () => {
    beforeEach(() => {
      message = { content: '{ "valid": "yes" }' };
    });
    it('should return rabbit message', () => {
      const expectedMessage = new Buffer(JSON.stringify(message));
      expect(parser.toRabbitMessage(message)).to.deep.equal(expectedMessage);
    });
  });
});
