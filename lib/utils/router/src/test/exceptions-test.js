'use strict';

const express = require('abacus-express');
const request = require('abacus-request');

const router = require('..');

/* jshint noyield: true */

describe('abacus-router exceptions', () => {
  let exit;
  let app;
  let routes;

  beforeEach(() => {
    exit = process.exit;
    process.exit = spy();

    app = express();
    routes = router();
  });

  afterEach(() => {
    process.exit = exit;
  });

  context('with generator middleware', () => {
    let server;

    beforeEach(() => {
      routes.get('/err/generator/request/:message', function*(req) {
        throw new Error(req.params.message);
      });

      // Add our router to the app
      app.use(routes);

      // Listen on an ephemeral port
      server = app.listen(0);
    });

    it('handles exceptions', (done) => {
      request.get('http://localhost::p/:v/generator/:r/:m',
        {
          p: server.address().port,
          v: 'err',
          r: 'request',
          m: 'boo'
        },
        (err, val) => {
          expect(err.message).to.equal('boo');
          expect(val).to.equal(undefined);
          done();
        }
      );
    });
  });

  context('with async middleware', () => {
    let server;

    beforeEach(() => {
      routes.get('/err/generator/request/:message', async(req) => {
        throw new Error(req.params.message);
      });

      // Add our router to the app
      app.use(routes);

      // Listen on an ephemeral port
      server = app.listen(0);
    });

    it('handles exceptions', (done) => {
      request.get('http://localhost::p/:v/generator/:r/:m',
        {
          p: server.address().port,
          v: 'err',
          r: 'request',
          m: 'boo'
        },
        (err, val) => {
          expect(err.message).to.equal('boo');
          expect(val).to.equal(undefined);
          done();
        }
      );
    });
  });

});
