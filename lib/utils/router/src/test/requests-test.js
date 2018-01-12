'use strict';

const express = require('abacus-express');
const request = require('abacus-request');

const router = require('..');

/* jshint noyield: true */

describe('abacus-router requests', () => {
  let app;
  let routes;

  beforeEach(() => {
    app = express();
    routes = router();
  });

  context('with standard middleware', () => {
    let server;

    beforeEach(() => {
      // Add a simple router level middleware
      routes.use((req, res, next) => next());

      // Return an OK response with a body
      routes.get('/ok/request', (req, res) => {
        res.send('okay');
      });

      app.use(routes);
      server = app.listen(0);
    });

    it('handles HTTP request', (done) => {
      request.get('http://localhost::p/:v/:r',
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

  context('with generator middleware', () => {
    let server;

    beforeEach(() => {
      routes.get('/ok/generator/request', function*(req) {
        return {
          body: 'okay'
        };
      });

      app.use(routes);
      server = app.listen(0);
    });

    it('handles HTTP request', (done) => {
      request.get('http://localhost::p/:v/generator/:r',
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

  context('with async middleware', () => {
    let server;

    beforeEach(() => {
      routes.get('/ok/async/request', async() => {
        return {
          body: 'okay'
        };
      });

      app.use(routes);
      server = app.listen(0);
    });

    it('handles HTTP request', (done) => {
      request.get(`http://localhost:${server.address().port}/ok/async/request`,
        undefined,
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal('okay');
          done();
        }
      );
    });
  });

  context('with route returning 500 code', () => {
    let server;

    beforeEach(() => {
      routes.get('/500/request', (req, res) => {
        res.status(500).end();
      });

      app.use(routes);
      server = app.listen(0);
    });

    it('handles HTTP request', (done) => {
      request.get(
        {
          uri: 'http://localhost::p/:v/:r',
          p: server.address().port,
          v: '500',
          r: 'request'
        },
        (err, val) => {
          expect(err.message).to.equal('HTTP response status code 500');
          expect(val).to.equal(undefined);
          done();
        }
      );
    });
  });

  context('with route returning JSON error object with a message field', () => {
    let server;

    beforeEach(() => {
      routes.get('/err/request/:message', (req, res) => {
        // Return a
        res.status(500).send({
          message: req.params.message
        });
      });

      app.use(routes);
      server = app.listen(0);
    });

    it('handles HTTP request', (done) => {
      request.get(
        'http://localhost::p/:v/:r/:m',
        {
          p: server.address().port,
          v: 'err',
          r: 'request',
          m: 'duh'
        },
        (err, val) => {
          expect(err.message).to.equal('duh');
          expect(val).to.equal(undefined);
          done();
        }
      );
    });
  });
});
