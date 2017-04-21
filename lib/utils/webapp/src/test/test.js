'use strict';

// Setup of Express in a Node cluster, a convenient starting point for Webapps.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

let webapp = require('..');

describe('abacus-webapp', () => {
  it('sets up an Express Webapp with a set of selected middleware', (done) => {

    // Create a test Webapp
    const app = webapp();

    // Add a test routes
    app.get('/ok/request', (req, res) => {
      // Return an OK response with a body
      res.send('okay');
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Send an HTTP request, expecting an OK response
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'ok',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay');
      done();
    });
  });

  it('sets up an Express Webapp with a basic set of middleware', (done) => {
    // Create a test Webapp
    const app = webapp.basic();

    // Add a test routes
    app.get('/ok/request', (req, res) => {
      // Return an OK response with a body
      res.send('okay');
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Send an HTTP request, expecting an OK response
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'ok',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay');
      done();
    });
  });

  context('validating health-check endpoint', () => {
    let server;
    const noAuthHeaders = {};
    const authHeaders = {
      authorization: 'Basic aW52YWxpZDpibGFibGE='
    };

    const verifyHelthCheck = (expectedStatusCode, headers, done, expectErr) => {
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

    context('when secured', () => {
      let getBearerTokenMock;
      let authorizeMock;

      const mockOAuth = () => {
        delete require.cache[require.resolve('..')];
        delete require.cache[require.resolve('abacus-oauth')];

        require('abacus-oauth');

        require.cache[require.resolve('abacus-oauth')]
          .exports.getBearerToken = (authServer, id, secret, scopes, cb) => {
            getBearerTokenMock(authServer, id, secret, scopes, cb);
          };
        require.cache[require.resolve('abacus-oauth')]
          .exports.authorize = (token, scope) => {
            authorizeMock(token, scope);
          };
      };

      beforeEach(() => {
        mockOAuth();

        webapp = require('..');
        process.env.SECURED = 'true';
        server = webapp().listen(0);
      });

      it('deny access, when error in acquiring token', (done) => {
        getBearerTokenMock = (authServer, id, secret, scopes, cb) => {
          cb(new Error('Error'), undefined);
        };

        verifyHelthCheck(500, authHeaders, done, true);
      });

      it('deny access, if UNAUTHORIZED when acquiring token', (done) => {
        getBearerTokenMock = (authServer, id, secret, scopes, cb) => {
          cb({ statusCode: 401 });
        };

        verifyHelthCheck(401, authHeaders, done);
      });

      it('deny access, when no credentials are sent', (done) => {
        verifyHelthCheck(401, noAuthHeaders, done);
      });

      it('deny access, when scope not exist', (done) => {
        getBearerTokenMock = (authServer, id, secret, scopes, cb) => {
          cb(undefined, 'Bearer 123567890');
        };
        authorizeMock = () => {
          throw { statusCode: 401 };
        };

        verifyHelthCheck(401, authHeaders, done);
      });

      it('allows access to authorized user', (done) => {
        getBearerTokenMock = (authServer, id, secret, scopes, cb) => {
          cb(undefined, 'Bearer 123567890');
        };
        authorizeMock = () => { };

        verifyHelthCheck(200, authHeaders, done);
      });
    });

    context('when not secured', () => {
      beforeEach(() => {
        webapp = require('..');
        process.env.SECURED = 'false';
        server = webapp().listen(0);
      });

      it('allow unauthorized access', (done) => {
        verifyHelthCheck(200, noAuthHeaders, done);
      });
    });
  });
});

