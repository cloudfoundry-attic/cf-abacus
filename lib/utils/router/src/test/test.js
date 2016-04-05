'use strict';

// Small Express router that runs request handlers written as ES6 generators
// using Node co.

const express = require('abacus-express');
const request = require('abacus-request');
const batch = require('abacus-batch');

const router = require('..');

/* jshint noyield: true */

describe('abacus-router', () => {
  let exit;
  beforeEach(() => {
    // Save process.exit function as tests mock it
    exit = process.exit;
  });
  afterEach(() => {
    // Restore original process.exit function
    process.exit = exit;
  });

  it('handles HTTP requests', (done) => {
    // Create a test Express app
    const app = express();

    // Create a router
    const routes = router();

    // Add a simple router level middleware
    routes.use((req, res, next) => next());

    // Add a few test routes
    routes.get('/ok/request', (req, res) => {
      // Return an OK response with a body
      res.send('okay');
    });
    routes.get('/ok/generator/request', function *(req) {
      // Return an OK response with a body
      return {
        body: 'okay'
      };
    });
    routes.get('/500/request', (req, res) => {
      // Return an error status
      res.status(500).end();
    });
    routes.get('/err/request/:message', (req, res) => {
      // Return a JSON error object with a message field
      res.status(500).send({
        message: req.params.message
      });
    });

    // Add our router to the app
    app.use(routes);

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 4) done();
    };

    // Send an HTTP request, expecting an OK response
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'ok',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay');
      done1();
    });

    // Send an HTTP request, expecting an OK response
    request.get('http://localhost::p/:v/generator/:r', {
      p: server.address().port,
      v: 'ok',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay');
      done1();
    });

    // Send an HTTP request, expecting a 500 status code
    // Here test the option to pass the URI as a field of the options object
    request.get({
      uri: 'http://localhost::p/:v/:r',
      p: server.address().port,
      v: '500',
      r: 'request'
    }, (err, val) => {
      expect(err.message).to.equal('HTTP response status code 500');
      expect(val).to.equal(undefined);
      done1();
    });

    // Send an HTTP request, expecting an error message
    request.get('http://localhost::p/:v/:r/:m', {
      p: server.address().port,
      v: 'err',
      r: 'request',
      m: 'duh'
    }, (err, val) => {
      expect(err.message).to.equal('duh');
      expect(val).to.equal(undefined);
      done1();
    });
  });

  it('handles exceptions', (done) => {
    process.exit = spy();

    // Create a test Express app
    const app = express();

    // Create a router
    const routes = router();

    // Add a test route
    routes.get('/err/generator/request/:message', function *(req) {
      // Throw an exception with a message field
      throw new Error(req.params.message);
    });

    // Add our router to the app
    app.use(routes);

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Send an HTTP request, expecting an error message
    request.get('http://localhost::p/:v/generator/:r/:m', {
      p: server.address().port,
      v: 'err',
      r: 'request',
      m: 'boo'
    }, (err, val) => {
      expect(err.message).to.equal('boo');
      expect(val).to.equal(undefined);
      done();
    });
  });

  // TODO re-enable this once we re-enable domain support
  xit('handles domain asynchronous exceptions', (done) => {
    process.exit = spy();

    // Create a test Express app
    const app = express();

    // Create a router
    const routes = router();

    // Add a test route
    routes.get('/err/request/:message', (req, res) => {
      // Throw an asynchronous exception with a message field
      setImmediate(() => {
        throw new Error(req.params.message);
      });
    });

    // Add our router to the app
    app.use(routes);

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Send an HTTP request, expecting an error message
    request.get('http://localhost::p/:v/:r/:m', {
      p: server.address().port,
      v: 'err',
      r: 'request',
      m: 'boo'
    }, (err, val) => {
      expect(err.message).to.equal('HTTP response status code 500');
      expect(val).to.equal(undefined);
      expect(process.exit.args.length).to.equal(1);
      done();
    });
  });

  it('handles batched requests', (done) => {
    // Create a test Express app
    const app = express();

    // Create a router
    const routes = router();

    // Add a few test routes
    routes.get('/ok/request', (req, res) => {
      // Return an OK response with a body
      res.send('okay');
    });
    routes.get('/ok/generator/request', function *(req) {
      // Return an OK response with a body
      return {
        body: 'okay'
      };
    });
    routes.get('/500/request', (req, res) => {
      // Return an error status
      res.status(500).end();
    });
    routes.get('/err/request/:message', (req, res) => {
      // Return a JSON error object with a message field
      res.status(500).send({
        message: req.params.message
      });
    });

    // Add our router to the app
    app.use(routes);

    // Add batch router middleware to the app
    app.use(router.batch(routes));

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 4) done();
    };

    // Use a batch version of the request module
    const brequest = batch(request);

    // Send an HTTP request, expecting an OK response
    brequest.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'ok',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay');
      done1();
    });

    // Send an HTTP request, expecting an OK response
    brequest.get('http://localhost::p/:v/generator/:r', {
      p: server.address().port,
      v: 'ok',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay');
      done1();
    });

    // Send an HTTP request, expecting a 500 status code
    // Here test the option to pass the URI as a field of the options object
    brequest.get({
      uri: 'http://localhost::p/:v/:r',
      p: server.address().port,
      v: '500',
      r: 'request'
    }, (err, val) => {
      expect(err.message).to.equal('HTTP response status code 500');
      expect(val).to.equal(undefined);
      done1();
    });

    // Send an HTTP request, expecting an error message
    brequest.get('http://localhost::p/:v/:r/:m', {
      p: server.address().port,
      v: 'err',
      r: 'request',
      m: 'duh'
    }, (err, val) => {
      expect(err.message).to.equal('duh');
      expect(val).to.equal(undefined);
      done1();
    });
  });

  it('handles exceptions in batched requests', (done) => {
    // Create a test Express app
    const app = express();

    // Create a router
    const routes = router();

    // Add a test route that throws an exception
    routes.get('/exception/request', (req, res) => {
      if (req.cause.unhandled.exception)
        res.status(200).send({ message: '' });
    });

    // Add our router to the app
    app.use(routes);

    // Add batch router middleware to the app
    app.use(router.batch(routes));

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Use a batch version of the request module
    const brequest = batch(request);

    // Send an HTTP request, expecting a 500 status code
    brequest.get({
      uri: 'http://localhost::p/:v/:r',
      p: server.address().port,
      v: 'exception',
      r: 'request'
    }, (err, val) => {
      // TODO See why this seems to be called twice
      if(!err)
        return;
      expect(err.message).to.equal('HTTP response status code 500');
      expect(val).to.equal(undefined);
      done();
    });
  });
});
