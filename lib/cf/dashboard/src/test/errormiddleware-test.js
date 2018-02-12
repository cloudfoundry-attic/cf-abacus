'use strict';
/* eslint-disable max-len*/
const index = require('./lib/index.js');
index.mockAuthMiddleware();
const _ = require('lodash');
const middleware = require('../middleware/errorMiddleware');
const utils = require('../utils');
const errors = utils.errors;
const NotFound = errors.NotFound;

class Response {
  constructor() {
    this.constructor.methods.forEach((method) => {
      this[method] = sinon.spy(() => {
        return this;
      });
    });
  }
  reset() {
    this.constructor.methods.forEach((method) => {
      this[method].reset();
    });
  }
  static get methods() {
    return ['set', 'status', 'sendStatus', 'send', 'json', 'render', 'format'];
  }
}

describe('middleware', () => {
  /* eslint no-unused-expressions:0 */
  const req = {
    method: 'GET',
    path: '/foo'
  };

  const res = new Response();
  const next = sinon.spy();

  afterEach(() => {
    next.reset();
    res.reset();
  });

  after(() => {
    index.deleteAuthMiddlewareCache();
  });

  describe('#notFound', () => {
    const notFoundMiddleware = middleware.notFound();
    let msg = 'Unable to find any resource ' +
      `matching the requested path '${req.path}'`;

    it('should always abort with a NotFound error', () => {
      notFoundMiddleware(req, res, next);
      sinon.assert.calledWith(next, sinon.match.instanceOf(NotFound)
        .and(sinon.match.has('message', msg)));
    });
  });

  describe('#error', () => {
    const error = {
      message: 'a message',
      foo: 'bar',
      stack: 'a stack trace'
    };
    const originalError = _.clone(error);

    describe('with stack trace', () => {
      const errorWithStackMiddleware = middleware.error(true);
      const errorResponse = _.assign(
        _.pick(originalError, 'message', 'stack'), {
          status: 500
        });
      let responseFormatter;
      const errorResponseForHtml = { message: 'Internal Error', status: 500 };

      beforeEach(() => {
        errorWithStackMiddleware(error, req, res, next);
        expect(res.format).to.have.been.calledOnce;
        responseFormatter = _.first(res.format.firstCall.args);
      });

      it('should not modify the error object', () => {
        expect(error).to.eql(originalError);
      });

      it('should respond with status 500 by default', () => {
        expect(res.status, 500);
        expect(next).to.not.have.been.called;
      });

      it('should respond with an error in json format', () => {
        responseFormatter.json();
        sinon.assert.calledWithExactly(res.json, errorResponse);
        expect(next).to.not.have.been.called;
      });

      it('should respond with an error in html format', () => {
        responseFormatter.html();
        sinon.assert.calledWithExactly(res.render, 'error', errorResponseForHtml);
        expect(next).to.not.have.been.called;
      });

      it('should respond with an error in text format', () => {
        responseFormatter.text();
        let responseText = _.first(res.send.firstCall.args);
        let parsedResponseText = _.chain(responseText).split('\n').map(
          (line) => {
            let [key, val] = line.split(/:\s*/);
            return [key, key !== 'status' ? val : parseInt(val)];
          }).fromPairs().value();
        expect(parsedResponseText).to.eql(errorResponse);
        expect(next).to.not.have.been.called;
      });
    });

    describe('without stack trace', () => {
      const errorMiddleware = middleware.error({
        env: 'production'
      });
      let responseFormatter;

      beforeEach(() => {
        errorMiddleware(error, req, res, next);
        expect(res.format).to.have.been.calledOnce;
        responseFormatter = _.first(res.format.firstCall.args);
      });

      it('should respond with an error that does not include a stack trace',
        () => {
          responseFormatter.json();
          expect(
            _.first(res.json.firstCall.args)).to.not.have.property('stack');
        });
    });
  });
});
