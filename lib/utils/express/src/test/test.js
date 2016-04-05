'use strict';

// Convenient setup of Express that uses the most popular and useful Express
// middleware handlers from the Express community.

const debug = require('abacus-debug');
const request = require('abacus-request');
const express = require('..');

/* jshint undef: false */
/* jshint unused: false */

describe('abacus-express', () => {
  let clock;
  let exit;
  beforeEach(() => {
    // Save process.exit function as tests mock it and setup fake timers
    exit = process.exit;
    clock = sinon.useFakeTimers(Date.now(),
      'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');
  });
  afterEach(() => {
    // Restore original process.exit function and original timers
    process.exit = exit;
    clock.restore();
  });

  it('quiesces before bailing out', (done) => {
    process.exit = spy();
    const inflight = spy();

    // Create a test Express app
    const app = express();

    app.get('/bailout/request', (req, res) => {
      // Throw an unrecoverable exception
      const exc = new Error('Boo');
      exc.bailout = true;
      throw exc;
    });
    app.get('/inflight/request', (req, res) => {
      // Never send a response, to help test server quiescing

      // Call our inflight mock function to signal that the request
      // has been received
      inflight();

      // Now send a request that'll make the server fail and eventually
      // bail out
      bailout();
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Send an HTTP request to a route that will never respond, to
    // help test server quiescing
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'inflight',
      r: 'request'
    }, spy());

    // Send an HTTP get request, expecting an error and the server
    // to bailout after quiescing
    const bailout = () => {
      request.get('http://localhost::p/:v/:r', {
        p: server.address().port,
        v: 'bailout',
        r: 'request'
      }, (err, val) => {
        expect(err.code).to.equal(500);
        expect(err.message).to.equal('Boo');
        expect(val).to.equal(undefined);

        // Expect the server process to not have exited at this point
        // since it's quiescing
        expect(inflight.args.length).to.equal(1);
        expect(process.exit.args.length).to.equal(0);

        clock.tick(31000);
        expect(process.exit.args.length).to.equal(1);
        done();
      });
    };
  });

  it('provides a basic Express app setup', (done) => {
    // Create a test Express app
    const app = express.basic();

    app.get('/ok/request', (req, res) => {
      // Return an OK response with a body
      res.send('okay');
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Send an HTTP get request, expecting an OK response
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

  it('provides a more complete Express app setup', (done) => {
    const on = spy();

    // Turn on debugging
    debug.enable('abacus-express');

    // Create a test Express app
    const app = express();

    // Register a listener
    express.on('message', on);

    // Add a few test routes
    app.get('/ok/request', (req, res) => {
      // Return an OK response with a body
      res.send('okay');
    });
    app.use((req, res, next) => {
      // Return an OK value with a body, headers and cookies
      if(req.path === '/ok/value')
        res.value = {
          type: 'txt',
          body: 'value',
          header: {
            Foo: 'bar'
          },
          cookie: {
            Cook: 'blah',
            Cook2: {
              value: 'duh'
            },
            Cook3: {
              value: 'hey',
              options: 'boo'
            }
          },
          locals: {
            a: 'b'
          },
          props: {
            c: 'd'
          },
          location: 'http://bar.com',
          links: {
            x: 'http://bar.com'
          }
        };
      next();
    });
    app.use((req, res, next) => {
      // Return a status 304 response
      if(req.path === '/304/statuscode')
        res.value = {
          statusCode: 304
        };
      if(req.path === '/304/status')
        res.value = {
          status: 304
        };
      next();
    });
    app.use((req, res, next) => {
      // Return a redirect value
      if(req.path === '/ok/redirect')
        res.value = {
          redirect: 'http://localhost:' + server.address().port +
            '/ok/request'
        };
      next();
    });
    app.post('/post/request', (req, res) => {
      // Return an OK response
      res.status(200).end();
    });
    app.get('/500/request', (req, res) => {
      // Return an error status
      res.status(500).end();
    });
    app.get('/err/request/:message', (req, res) => {
      // Return a JSON object with a message field
      res.status(500).send({
        message: req.params.message
      });
    });
    app.get('/exception/request', (req, res) => {
      // Throw an exception
      throw new Error('Ooops');
    });
    app.get('/bailout/request', (req, res) => {
      // Throw an unrecoverable exception
      const exc = new Error('Boo');
      exc.bailout = true;
      throw exc;
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 12) done();
    };

    // Send an HTTP get request, expecting an OK response
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

    // Send an HTTP get request, expecting an OK response, a header and a
    // cookie, and a few more things
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'ok',
      r: 'value'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('value');
      done1();
    });

    // Send an HTTP get request, expecting a status code
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: '304',
      r: 'statuscode'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(304);
      done1();
    });
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: '304',
      r: 'status'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(304);
      done1();
    });

    // Send an HTTP get request, expecting a redirect response
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'ok',
      r: 'redirect'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay');
      done1();
    });

    // Send an HTTP post request, expecting an OK response
    request.post('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'post',
      r: 'request',
      body: {
        value: 'value'
      }
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      done1();
    });

    // Send an HTTP get request, expecting a 500 status code
    // Here test the option to pass the URI as a field of the options object
    request.get({
      uri: 'http://localhost::p/:v/:r',
      p: server.address().port,
      v: '500',
      r: 'request'
    }, (err, val) => {
      expect(err.code).to.equal(500);
      expect(err.message).to.equal('HTTP response status code 500');
      expect(val).to.equal(undefined);
      done1();
    });

    // Send an HTTP get request, expecting an error message
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

    // Send an HTTP options request, expecting an OK result
    request.options('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'options',
      r: 'request',
      headers: {
        origin: 'http://foo.com'
      }
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(
        val.headers['access-control-allow-origin']).to.equal('http://foo.com');
      done1();
    });

    // Send an HTTP get request, expecting a 404 status code
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: '404',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(404);
      expect(val.body).to.deep.equal({
        error: 'notfound',
        message: 'Not found'
      });
      done1();
    });

    // Send an HTTP get request, expecting an error
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'exception',
      r: 'request'
    }, (err, val) => {
      expect(err.code).to.equal(500);
      expect(err.message).to.equal('Ooops');
      expect(val).to.equal(undefined);
      done1();
    });

    // Send an HTTP get request, expecting log config info
    request.get('http://localhost::p/debug', {
      p: server.address().port,
      v: 'ok',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal({
        config: 'abacus-express'
      });
      done1();
    });
  });

  it('handles server events', () => {
    process.exit = spy();

    // Create a test Express app
    const app = express();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Simulate a server socket upgrade
    server.emit('upgrade', {
      url: 'http://foo.com'
    });

    // Simulate a server error
    server.emit('error', {});

    // Expect the server process to exit
    clock.tick(1000);
    expect(process.exit.args.length).to.equal(1);
  });

  xit('bails out on unrecoverable errors', () => {
    process.exit = spy();

    // Create a test Express app
    const app = express();

    app.get('/bailout/request', (req, res) => {
      // Throw an unrecoverable exception
      const exc = new Error('Boo');
      exc.bailout = true;
      throw exc;
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Send an HTTP get request, expecting an error and the server
    // to bailout
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'bailout',
      r: 'request'
    }, (err, val) => {
      expect(err.code).to.equal(500);
      expect(err.message).to.equal('Ooops');
      expect(val).to.equal(undefined);

      // Expect the server process to exit
      expect(process.exit.args.length).to.equal(1);
    });
  });

});

