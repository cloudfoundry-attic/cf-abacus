'use strict';

// Setup of Express in a Node cluster, a convenient starting point for Webapps.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const router = require('abacus-router');

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

let webapp = require('..');

describe('abacus-webapp healthcheck', () => {
  let server;
  const noAuthHeaders = {};
  const authHeaders = {
    authorization: 'Basic aW52YWxpZDpibGFibGE='
  };

  beforeEach(() => {
    // Delete cached modules exports
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('abacus-oauth')];
  });

  const verifyHealthCheck = (expectedStatusCode, headers, expectErr, done) => {
    request.get('http://localhost::p/:v', {
      p: server.address().port,
      v: 'healthcheck',
      headers: headers
    }, (err, val) => {
      if (expectErr)
        expect(err.statusCode).to.equal(expectedStatusCode);
      else
        expect(val.statusCode).to.equal(expectedStatusCode);
      done();
    });
  };

  context('with secured Abacus', () => {
    let getBearerTokenMock;
    let authorizeMock;
    let oauth;

    beforeEach(() => {
      process.env.SECURED = 'true';
    });

    const startAppWithProtectedEndpoint = () => {
      const app = require('..')();

      // Add secured app endpoint
      const routes = router();
      routes.get('/v1/test', function *() {
        return { body: { test: 123 } };
      });
      app.use(routes, oauth.validator(process.env.JWTKEY,
        process.env.JWTALGO));

      server = app.listen(0);
    };

    beforeEach(() => {
      oauth = require('abacus-oauth');

      require.cache[require.resolve('abacus-oauth')]
        .exports.getBearerToken = (authServer, id, secret, scopes, cb) => {
          getBearerTokenMock(authServer, id, secret, scopes, cb);
        };
      require.cache[require.resolve('abacus-oauth')]
        .exports.authorize = (token, scope) => {
          authorizeMock(token, scope);
        };
    });

    afterEach(() => {
      getBearerTokenMock = undefined;
      authorizeMock = undefined;
      oauth = undefined;
    });

    context('and secured healthcheck', () => {
      beforeEach(() => {
        process.env.HEALTHCHECK_SECURED = 'true';
      });

      const testHealthCheck = () => {
        it('deny access, when error in acquiring token', (done) => {
          getBearerTokenMock = (authServer, id, secret, scopes, cb) => {
            cb(new Error('Error'), undefined);
          };

          verifyHealthCheck(500, authHeaders, true, done);
        });

        it('deny access, if UNAUTHORIZED when acquiring token', (done) => {
          getBearerTokenMock = (authServer, id, secret, scopes, cb) => {
            cb({ statusCode: 401 });
          };

          verifyHealthCheck(401, authHeaders, false, done);
        });

        it('deny access, when no credentials are sent', (done) => {
          verifyHealthCheck(401, noAuthHeaders, false, done);
        });

        it('deny access, when scope not exist', (done) => {
          getBearerTokenMock = (authServer, id, secret, scopes, cb) => {
            cb(undefined, 'Bearer 123567890');
          };
          authorizeMock = () => {
            throw { statusCode: 401 };
          };

          verifyHealthCheck(401, authHeaders, false, done);
        });

        it('allows access to authorized user', (done) => {
          getBearerTokenMock = (authServer, id, secret, scopes, cb) => {
            cb(undefined, 'Bearer 123567890');
          };
          authorizeMock = () => { };

          verifyHealthCheck(200, authHeaders, false, done);
        });
      };

      context('and default webapp', () => {
        beforeEach(() => {
          webapp = require('..')();
          server = webapp.listen(0);
        });

        testHealthCheck();
      });

      context('and webapp with oauth protected endpoints', () => {
        beforeEach(() => {
          process.env.JWTKEY = 'secret';
          process.env.JWTALGO = 'HS256';

          startAppWithProtectedEndpoint();
        });

        testHealthCheck();
      });
    });

    context('and unsecured healthcheck', () => {
      beforeEach(() => {
        process.env.HEALTHCHECK_SECURED = 'false';
      });

      context('and default webapp', () => {
        beforeEach(() => {
          webapp = require('..')();
          server = webapp.listen(0);
        });

        it('allows unauthorized access', (done) => {
          verifyHealthCheck(200, noAuthHeaders, false, done);
        });
      });

      context('and webapp with oauth protected endpoints', () => {
        beforeEach(() => {
          process.env.JWTKEY = 'secret';
          process.env.JWTALGO = 'HS256';

          startAppWithProtectedEndpoint();
        });

        it('allows unauthorized access', (done) => {
          verifyHealthCheck(200, noAuthHeaders, false, done);
        });
      });
    });
  });

  context('with not secured Abacus', () => {
    beforeEach(() => {
      process.env.SECURED = 'false';

      webapp = require('..')();
      server = webapp.listen(0);
    });

    it('allows unauthorized access', (done) => {
      verifyHealthCheck(200, noAuthHeaders, false, done);
    });
  });
});

