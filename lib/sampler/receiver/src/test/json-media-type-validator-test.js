'use strict';

const httpStatus = require('http-status-codes');
const { validateJsonMediaType } = require('../lib/json-media-type-validator');

describe('#validateJsonMediaType', () => {
  let request;
  let response;
  let sendStub;
  let next;

  beforeEach(() => {
    request = {
      is: sinon.stub()
    };

    sendStub = sinon.stub();
    const statusStub = sinon.stub().returns({
      send: sendStub
    });
    response = {
      status: statusStub,
      send: sinon.stub()
    };
    next = sinon.stub();
  });

  context('when Content type is json', () => {

    beforeEach(() => {
      request.is.returns(true);
      validateJsonMediaType(request, response, next);
    });

    it('it should call next middleware', () => {
      assert.calledOnce(next);
      assert.notCalled(sendStub);
    });

  });

  context('when Content type is not json', () => {

    beforeEach(() => {
      request.is.returns(false);
      validateJsonMediaType(request, response, next);
    });

    it('it should send Unsupported Media Type status', () => {
      assert.notCalled(next);
      assert.calledOnce(response.status);
      assert.calledWithExactly(response.status, httpStatus.UNSUPPORTED_MEDIA_TYPE);
      assert.calledOnce(sendStub);
    });

  });

});
