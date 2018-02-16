'use strict';

// const request = require('supertest');

const { Consumer } = require('abacus-rabbitmq');
const meter = require('..');
// const { extend } = require('underscore');

// const consumerMock = class Consumer {
//   constructor() {
//   }
// consume(config) {
// }
// };

// const rabbitMock = extend({}, rabbit, {
//   Consumer: consumerMock
// });

// require.cache[require.resolve('abacus-rabbitmq')].exports = rabbitMock;

describe('test meter app', () => {

  let sandbox;
  let server;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when starting', () => {

    beforeEach(() => {
      // server = meter();
    });

    afterEach(() => {
      if(server)
        server.close();
    });

    it('consumes messages', () => {
      const consumerStub = sandbox.stub(Consumer.prototype, 'consume');

      server = meter();

      assert.calledOnce(consumerStub);
    });
  });

});
