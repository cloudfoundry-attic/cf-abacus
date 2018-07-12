'use strict';

const response = require('../lib/response');
const { UNAUTHORIZED } = require('http-status-codes');

describe('sendUnauthorized', () => {
  let resp;

  beforeEach(() => {
    resp = {
      status: sinon.stub(),
      header: sinon.stub(),
      end: sinon.stub()
    };
    resp.status.callsFake(() => resp);
    resp.header.callsFake(() => resp);
    resp.end.callsFake(() => resp);
  });

  it('sends a response with proper status code and header', () => {
    response.sendUnauthorized(resp);
    assert.calledOnce(resp.status);
    assert.calledWithExactly(resp.status, UNAUTHORIZED);
    assert.calledOnce(resp.header);
    assert.calledWithExactly(resp.header, 'WWW-Authenticate', 'Bearer realm="cf"');
    assert.calledOnce(resp.end);
  });

  it('sends a response with proper status code, header, and error code', () => {
    response.sendUnauthorized(resp, 'invalid_call');
    assert.calledOnce(resp.status);
    assert.calledWithExactly(resp.status, UNAUTHORIZED);
    assert.calledOnce(resp.header);
    assert.calledWithExactly(resp.header, 'WWW-Authenticate', 'Bearer realm="cf", error="invalid_call"');
    assert.calledOnce(resp.end);
  });

  it('sends a response with proper status code, header, error code, and error message', () => {
    response.sendUnauthorized(resp, 'invalid_call', 'Credentials are missing!');
    assert.calledOnce(resp.status);
    assert.calledWithExactly(resp.status, UNAUTHORIZED);
    assert.calledOnce(resp.header);
    assert.calledWithExactly(resp.header, 'WWW-Authenticate',
      'Bearer realm="cf", error="invalid_call", error_description="Credentials are missing!"');
    assert.calledOnce(resp.end);
  });
});
