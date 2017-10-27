'use strict';

const credentials = require('../credentials');

describe('credentials', () => {

  const username = 'abacus';
  const password = 'top-secret';

  const header = 'Basic YWJhY3VzOnRvcC1zZWNyZXQ=';
  const noUsernameHeader = 'Basic OnRvcC1zZWNyZXQ=';
  const noPasswordHeader = 'Basic YWJhY3VzOg==';
  const singleSegmentHeader = 'Basic YWJhY3Vz';
  const threeSegmentHeader = 'Basic YWJhY3VzOnRvcC1zZWNyZXQ6dHJhaWxpbmc=';

  const request = {
    headers: {
      authorization: header
    }
  };
  const unauthorizedRequest = {
    headers: {}
  };
  const blankRequest = {};

  describe('fromHeader', () => {
    it('extracts credentials', () => {
      const result = credentials.fromHeader(header);
      expect(result).to.deep.equal({
        username,
        password
      });
    });

    it('extracts credentials without username', () => {
      const result = credentials.fromHeader(noUsernameHeader);
      expect(result).to.deep.equal({
        username: '',
        password
      });
    });

    it('extracts credentials without password', () => {
      const result = credentials.fromHeader(noPasswordHeader);
      expect(result).to.deep.equal({
        username,
        password: ''
      });
    });

    it('fails on undefined header', () => {
      expect(() => {
        credentials.fromHeader(undefined);
      }).to.throw(Object)
        .that.has.property('statusCode').that.equals(401);
    });

    it('fails on empty header', () => {
      expect(() => {
        credentials.fromHeader('');
      }).to.throw(Object)
        .that.has.property('statusCode').that.equals(401);
    });

    it('fails on invalid header', () => {
      expect(() => {
        credentials.fromHeader('BasicYWJhY3VzOnRvcC1zZWNyZXQ=');
      }).to.throw(Object)
        .that.has.property('statusCode').that.equals(401);
    });

    it('fails on insufficient segments', () => {
      expect(() => {
        credentials.fromHeader(singleSegmentHeader);
      }).to.throw(Object)
        .that.has.property('statusCode').that.equals(401);
    });

    it('fails on excess segments', () => {
      expect(() => {
        credentials.fromHeader(threeSegmentHeader);
      }).to.throw(Object)
        .that.has.property('statusCode').that.equals(401);
    });
  });

  describe('fromRequest', () => {
    it('extracts credentials', () => {
      const result = credentials.fromRequest(request);
      expect(result).to.deep.equal({
        username,
        password
      });
    });

    it('fails on missing header', () => {
      expect(() => {
        credentials.fromRequest(unauthorizedRequest);
      }).to.throw(Object)
        .that.has.property('statusCode').that.equals(401);
    });

    it('fails on missing headers', () => {
      expect(() => {
        credentials.fromRequest(blankRequest);
      }).to.throw(Object)
        .that.has.property('statusCode').that.equals(401);
    });
  });
});
