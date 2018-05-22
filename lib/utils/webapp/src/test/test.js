'use strict';

// Setup of Express in a Node cluster, a convenient starting point for Webapps.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

let webapp;

const setUpWebapp = (isWorker) => {
  require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster, {
    isWorker: () => isWorker
  });
  delete require.cache[require.resolve('..')];
  webapp = require('..');
};

describe('abacus-webapp', () => {
  context('with no set connection timeout', () => {
    beforeEach(() => {
      setUpWebapp(true);
    });

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
      request.get(
        'http://localhost::p/:v/:r',
        {
          p: server.address().port,
          v: 'ok',
          r: 'request'
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal('okay');
          done();
        }
      );
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
      request.get(
        'http://localhost::p/:v/:r',
        {
          p: server.address().port,
          v: 'ok',
          r: 'request'
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal('okay');
          done();
        }
      );
    });
  });

  context('with a set connection timeout', () => {
    const smallValue = 20;
    const bigValue = 30;

    let server;

    const setUp = (connectionTimeout, requestTimeInMillisecodns) => {
      process.env.CONNECTION_TIMEOUT = connectionTimeout;

      let app = webapp();
      app.get('/request', (req, res) => {
        setTimeout(() => {
          res.send('okay');
        }, requestTimeInMillisecodns);
      });
      server = app.listen(0);
    };

    context('in case webapp is master', () => {
      beforeEach(() => {
        setUpWebapp(false);
        setUp(bigValue, smallValue);
      });

      it('connection timeout stays default', () => {
        // Default is 2 minutes: https://nodejs.org/api/http.html#http_server_timeout
        expect(server.timeout).to.equal(120000);
      });
    });

    context('in requests taking less time than configured timeout', () => {
      beforeEach(() => {
        setUpWebapp(true);
        setUp(bigValue, smallValue);
      });

      it('request should succeed', (done) => {
        request.get('http://localhost::p/request', {
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal('okay');
          done();
        });
      });

      it('server should have correct connection timeout value set', () => {
        expect(server.timeout).to.equal(bigValue);
      });
    });

    context('in requests taking more time than configured timeout', () => {
      beforeEach(() => {
        setUpWebapp(true);
        setUp(smallValue, bigValue);
      });

      it('request should fail', (done) => {
        request.get('http://localhost::p/request', {
          p: server.address().port
        }, (err, val) => {
          expect(err).not.to.equal(undefined);
          expect(err.message).to.equal('socket hang up');
          done();
        });
      });

      it('server should have correct connection timeout value set', () => {
        expect(server.timeout).to.equal(smallValue);
      });
    });
  });
});
