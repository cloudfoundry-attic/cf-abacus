'use strict';

// Setup of Express in a Node cluster, a convenient starting point for Webapps.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster);

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

  context('with a given connection timeout', () => {
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

    context('in requests taking less time than configured timeout', () => {
      beforeEach(() => {
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
    });

    context('in requests taking more time than configured timeout', () => {
      beforeEach(() => {
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