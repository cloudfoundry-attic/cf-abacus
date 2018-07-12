'use strict';

const request = require('../lib/request');

const createAuthRequest = (authHeader) => {
  return {
    headers: {
      authorization: authHeader
    }
  };
};

describe('hasAuthorization', () => {
  it('returns true on request with valid authorization header', () => {
    const req = createAuthRequest('Type Credentials');
    expect(request.hasAuthorization(req)).to.equal(true);
  });

  it('returns false on request with invalid authorization header', () => {
    const req = createAuthRequest('ThisIsASingleString');
    expect(request.hasAuthorization(req)).to.equal(false);
  });

  it('returns false on request with undefined authorization header', () => {
    const req = createAuthRequest(undefined);
    expect(request.hasAuthorization(req)).to.equal(false);
  });

  it('returns false on request with null authorization header', () => {
    const req = createAuthRequest(null);
    expect(request.hasAuthorization(req)).to.equal(false);
  });

  it('returns false on request with missing authorization header', () => {
    const req = { headers: {} };
    expect(request.hasAuthorization(req)).to.equal(false);
  });

  it('returns false on request without headers', () => {
    const req = {};
    expect(request.hasAuthorization(req)).to.equal(false);
  });
});

describe('getAuthorization', () => {
  it('returns auth structure on request with valid authorization header', () => {
    const req = createAuthRequest('Type Credentials');
    expect(request.getAuthorization(req)).to.deep.equal({
      type: 'type',
      credentials: 'Credentials'
    });
  });

  it('returns null on request with invalid authorization header', () => {
    const req = createAuthRequest('ThisIsASingleString');
    expect(request.getAuthorization(req)).to.equal(null);
  });
});
