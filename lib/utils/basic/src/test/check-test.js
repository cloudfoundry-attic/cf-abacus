'use strict';

const check = require('../check');

describe('check', () => {
  const basicHeader = 'Basic YWJhY3VzOnRvcC1zZWNyZXQ=';
  const bearerHeader = 'Bearer YWJhY3VzOnRvcC1zZWNyZXQ=';
  const corruptBasicHeader = 'BasicYWJhY3VzOnRvcC1zZWNyZXQ=';
  const request = {
    headers: {
      authorization: basicHeader
    }
  };
  const unauthorizedRequest = {
    headers: {}
  };
  const blankRequest = {};

  describe('isBasicHeader', () => {
    it('returns true on basic auth header', () => {
      expect(check.isBasicHeader(basicHeader)).to.equal(true);
    });

    it('returns false on non-basic auth header', () => {
      expect(check.isBasicHeader(bearerHeader)).to.equal(false);
    });

    it('returns false on corrupt basic auth header', () => {
      expect(check.isBasicHeader(corruptBasicHeader)).to.equal(false);
    });
  });
    
  describe('isBasicRequest', () => {
    it('returns true on basic request', () => {
      expect(check.isBasicRequest(request)).to.equal(true);
    });

    it('returns false on missing auth header', () => {
      expect(check.isBasicRequest(unauthorizedRequest)).to.equal(false);
    });

    it('returns false on empty request', () => {
      expect(check.isBasicRequest(blankRequest)).to.equal(false);
    });
  });
});
