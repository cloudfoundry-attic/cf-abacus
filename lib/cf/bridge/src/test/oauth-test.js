'use strict';

const _ = require('underscore');
const extend = _.extend;
const clone = _.clone;

// Mock the cluster module
const cluster = require('abacus-cluster');
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

describe('CF Token refresh', () => {

  afterEach(() => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('../oauth.js')];
  });

  context('on success', () => {
    let oauth;
    let reqMock;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqMock = extend(clone(request), {
        get: spy((uri, opts, cb) => {
          cb(null, {
            statusCode: 200,
            body: {
              token_type: 'bearer',
              access_token: 'token',
              expires_in: 100000
            }
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqMock;

      oauth = require('../oauth.js');
      oauth.start('id', 'secret');
    });

    afterEach(() => {
      oauth.stop();
    });

    it('uses the correct credentials to get uaa token', function(done) {
      setTimeout(() => {
        const args = reqMock.get.args;
        expect(args.length).to.equal(1);
        expect(args[0][0]).to.equal(
          ':uaa/oauth/token?grant_type=client_credentials');
        expect(args[0][1]).to.eql({
          uaa: 'http://uaa',
          auth: {
            user:'id',
            password: 'secret'
          }
        });

        done();
      }, 50);
    });

    it('obtains uaa token', function(done) {
      setTimeout(() => {
        const token = oauth.getToken();
        expect(token).to.be.an('string');
        expect(token).to.equal('bearer token');

        done();
      }, 50);
    });
  });

  context('on bad response code', () => {
    let oauth;
    let reqMock;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqMock =
        extend(clone(request), {
          get: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 500,
              body: {}
            });
          })
        });
      require.cache[require.resolve('abacus-request')].exports = reqMock;

      oauth = require('../oauth.js');
      oauth.start('id', 'secret');
    });

    afterEach(() => {
      oauth.stop();
    });

    it('fails to obtains uaa token', function(done) {
      setTimeout(() => {
        const token = oauth.getToken();
        expect(token).to.equal(undefined);

        done();
      }, 50);
    });
  });

  context('on error', () => {
    let oauth;
    let reqMock;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqMock = extend(clone(request), {
        get: spy((uri, opts, cb) => {
          cb('error', {});
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqMock;

      oauth = require('../oauth.js');
      oauth.start('id', 'secret');
    });

    afterEach(() => {
      oauth.stop();
    });

    it('fails to obtain uaa token', function(done) {
      setTimeout(() => {
        const token = oauth.getToken();
        expect(token).to.equal(undefined);

        done();
      }, 50);
    });
  });
});

describe('Module lifecycle', () => {
  let oauth;

  beforeEach(() => {
    oauth = require('../oauth.js');
  });

  afterEach(() => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('../oauth.js')];

    oauth.stop();
  });

  context('start throws exception', () => {
    it('when all params are missing', function(done) {
      expect(oauth.start.bind(oauth)).
        to.throw('Missing credentials');
      done();
    });

    it('when a secret is missing', function(done) {
      expect(oauth.start.bind(oauth, 'clientId')).
        to.throw('Missing credentials');
      done();
    });

    it('when a clientId is missing', function(done) {
      expect(oauth.start.bind(oauth, undefined, 'secret')).
        to.throw('Missing credentials');
      done();
    });
  });

  context('second start', () => {
    beforeEach(() => {
      oauth.start('clientId', 'secret');
    });

    it('throws exception', () => {
      expect(oauth.start.bind(oauth, 'clientId', 'secret')).
        to.throw('Already started');
    });
  });

  context('second stop', () => {
    beforeEach(() => {
      oauth.start('clientId', 'secret');
      oauth.stop();
    });

    it('does not error', () => {
      expect(oauth.stop.bind(oauth)).not.to.throw();
    });
  });

  context('stop without start', () => {
    it('does not error', () => {
      expect(oauth.stop.bind(oauth)).not.to.throw();
    });
  });
});
