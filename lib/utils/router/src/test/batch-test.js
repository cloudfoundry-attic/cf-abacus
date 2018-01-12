'use strict';

const express = require('abacus-express');
const request = require('abacus-request');
const batch = require('abacus-batch');

// Use a batch version of the request module
const brequest = batch(request);

const router = require('..');

/* jshint noyield: true */

describe('abacus-router batch', () => {
  let app;
  let routes;

  beforeEach(() => {
    app = express();
    routes = router();
  });

  context('with standard middleware', () => {
    let server;

    beforeEach(() => {
      routes.get('/ok/request', (req, res) => {
        res.send('okay');
      });

      app.use(routes); // Add our router to the app
      app.use(router.batch(routes)); // Add batch router middleware to the app
      server = app.listen(0); // Listen on an ephemeral port
    });

    it('handles batched request', (done) => {
      brequest.get('http://localhost::p/:v/:r',
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

      app.use(routes); // Add our router to the app
      app.use(router.batch(routes)); // Add batch router middleware to the app
      server = app.listen(0); // Listen on an ephemeral port
    });

    it('handles batched request', (done) => {
      brequest.get(
        'http://localhost::p/:v/generator/:r',
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

  context('with error status middleware', () => {
    let server;

    beforeEach(() => {
      routes.get('/500/request', (req, res) => {
        res.status(500).end();
      });

      app.use(routes); // Add our router to the app
      app.use(router.batch(routes)); // Add batch router middleware to the app
      server = app.listen(0); // Listen on an ephemeral port
    });

    it('handles batched request', (done) => {
      brequest.get(
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

  context('with middleware returning JSON error object with a message field', () => {
    let server;

    beforeEach(() => {
      routes.get('/err/request/:message', (req, res) => {
        res.status(500).send({
          message: req.params.message
        });
      });

      app.use(routes); // Add our router to the app
      app.use(router.batch(routes)); // Add batch router middleware to the app
      server = app.listen(0); // Listen on an ephemeral port
    });

    it('handles batched request', (done) => {
      brequest.get(
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

  context('with middleware that throws exception', () => {
    let server;

    beforeEach(() => {
      routes.get('/exception/request', (req, res) => {
        if (req.cause.unhandled.exception) res.status(200).send({ message: '' });
      });

      // Add our router to the app
      app.use(routes);

      // Add batch router middleware to the app
      app.use(router.batch(routes));

      // Listen on an ephemeral port
      server = app.listen(0);
    });

    it('handles exception', (done) => {
      brequest.get(
        {
          uri: 'http://localhost::p/:v/:r',
          p: server.address().port,
          v: 'exception',
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
});
