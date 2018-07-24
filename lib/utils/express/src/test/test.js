'use strict';

// Convenient setup of Express that uses the most popular and useful Express
// middleware handlers from the Express community.

const debug = require('abacus-debug');
const request = require('abacus-request');
const moment = require('abacus-moment');
const express = require('..');

describe('abacus-express', () => {
  let clock;
  let exit;
  beforeEach(() => {
    // Save process.exit function as tests mock it and setup fake timers
    exit = process.exit;
    clock = sinon.useFakeTimers(moment.now(), 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');
  });
  afterEach(() => {
    // Restore original process.exit function and original timers
    process.exit = exit;
    clock.restore();
  });

  it('quiesces before bailing out', (done) => {
    process.exit = spy();

    // Send an HTTP get request, expecting an error and the server
    // to bailout after quiescing
    const bailout = () => {
      request.get(
        'http://localhost::p/:v/:r',
        {
          p: server.address().port,
          v: 'bailout',
          r: 'request'
        },
        (err, val) => {
          expect(err.code).to.equal(500);
          expect(err.message).to.equal('Boo');
          expect(val).to.equal(undefined);

          expect(process.exit.callCount).to.equal(0);

          clock.tick(31000);
          expect(process.exit.callCount).to.equal(1);
          done();
        }
      );
    };

    const app = express();

    app.get('/bailout/request', (req, res) => {
      const exc = new Error('Boo');
      exc.bailout = true;
      throw exc;
    });

    app.get('/inflight/request', (req, res) => {
      bailout();
    });

    const server = app.listen(0);

    // Send an HTTP request to a route that will never respond, to
    // help test server quiescing
    request.get(
      'http://localhost::p/:v/:r',
      {
        p: server.address().port,
        v: 'inflight',
        r: 'request'
      },
      () => {}
    );
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

  it('bails out on unrecoverable errors', (done) => {
    process.exit = spy();
    const errorMessage = 'Ooops';

    const app = express();

    app.get('/bailout/request', (req, res) => {
      const exc = new Error(errorMessage);
      exc.bailout = true;
      throw exc;
    });

    const server = app.listen(0);

    request.get(
      'http://localhost::p/:v/:r',
      {
        p: server.address().port,
        v: 'bailout',
        r: 'request'
      },
      (err, val) => {
        expect(err.code).to.equal(500);
        expect(err.message).to.equal(errorMessage);
        expect(val).to.equal(undefined);
        expect(process.exit.callCount).to.equal(1);
        done();
      }
    );
  });

  context('provides a more complete Express app setup', () => {
    const on = spy();
    let app;
    let server;

    beforeEach(() => {
      app = express();
      express.on('message', on);
    });

    context('When requesting any url', () => {
      beforeEach(() => {
        server = app.listen(0);
      });

      it('validate default custom headers', (done) => {
        request.get(
          'http://localhost::p/:v/:r',
          {
            p: server.address().port,
            v: 'any',
            r: 'url'
          },
          (err, val) => {
            expect(val.headers['x-powered-by']).to.not.equal(undefined);
            expect(val.headers['x-process-id']).to.not.equal(undefined);
            expect(val.headers['x-uptime']).to.not.equal(undefined);
            expect(val.headers['x-response-time']).to.not.equal(undefined);

            expect(val.headers['x-heap-used']).to.equal(undefined);
            expect(val.headers['x-node-version']).to.equal(undefined);

            done();
          }
        );
      });
    });

    context('When sending an HTTP get request', () => {
      beforeEach(() => {
        app.get('/ok/request', (req, res) => {
          res.send('okay');
        });

        server = app.listen(0);
      });

      it('should receive an OK response', (done) => {
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

    context('An HTTP request returns a specific status code', () => {
      let responseValueFn;

      beforeEach(() => {
        app.use((req, res, next) => {
          res.value = responseValueFn();
          next();
        });

        server = app.listen(0);
      });

      const test = (responseValue, done) => {
        responseValueFn = () => {
          return responseValue;
        };

        request.get(
          'http://localhost::p/:v/:r',
          {
            p: server.address().port,
            v: '304',
            r: 'statuscode'
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(304);
            done();
          }
        );
      };

      it('should send the status code as statusCode field in the response', (done) => {
        test({ statusCode: 304 }, done);
      });

      it('should send the status code as status field in the response', (done) => {
        test({ status: 304 }, done);
      });
    });

    context('An HTTP request returns 500', () => {
      beforeEach(() => {
        app.get('/500/request', (req, res) => {
          res.status(500).end();
        });
        server = app.listen(0);
      });

      it('should receive status code 500', (done) => {
        request.get(
          {
            uri: 'http://localhost::p/:v/:r',
            p: server.address().port,
            v: '500',
            r: 'request'
          },
          (err, val) => {
            expect(err.code).to.equal(500);
            expect(err.message).to.equal('HTTP response status code 500');
            expect(val).to.equal(undefined);
            done();
          }
        );
      });
    });

    context('An HTTP request with origin header', () => {
      beforeEach(() => {
        app.get('/url', (req, res) => {
          res.status(200).end();
        });
        server = app.listen(0);
      });

      it('should receive status CORS headers', (done) => {
        request.get(
          {
            uri: 'http://localhost::p/url',
            p: server.address().port,
            headers: {
              origin: 'true'
            }
          },
          (err, val) => {
            expect(val.statusCode).to.equal(200);
            expect(val.headers['access-control-allow-credentials']).to.not.equal(undefined);
            expect(val.headers['access-control-allow-origin']).to.not.equal(undefined);
            expect(val.headers['access-control-allow-methods']).to.not.equal(undefined);
            expect(val.headers['access-control-allow-headers']).to.not.equal(undefined);
            expect(val.headers['access-control-max-age']).to.not.equal(undefined);

            done();
          }
        );
      });
    });

    context('An HTTP request sends a param', () => {
      beforeEach(() => {
        app.get('/err/request/:message', (req, res) => {
          // Return a JSON object with a message field
          res.status(500).send({
            message: req.params.message
          });
        });
        server = app.listen(0);
      });

      it('should receive a correct response', (done) => {
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

    context('An HTTP request redirects', () => {
      beforeEach(() => {
        app.get('/ok/request', (req, res) => {
          res.send('okay');
        });

        app.use((req, res, next) => {
          if (req.path === '/ok/redirect')
            res.value = {
              redirect: 'http://localhost:' + server.address().port + '/ok/request'
            };
          next();
        });

        server = app.listen(0);
      });

      it('should follow the redirect', (done) => {
        request.get(
          'http://localhost::p/:v/:r',
          {
            p: server.address().port,
            v: 'ok',
            r: 'redirect'
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

    context('When sending an HTTP post request', () => {
      beforeEach(() => {
        app.post('/post/request', (req, res) => {
          // Return an OK response
          res.status(200).end();
        });

        server = app.listen(0);
      });
      it('should receive an OK response', (done) => {
        request.post(
          'http://localhost::p/:v/:r',
          {
            p: server.address().port,
            v: 'post',
            r: 'request',
            body: {
              value: 'value'
            }
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            done();
          }
        );
      });
    });

    context('When sending an HTTP get request that writes in the response', () => {
      beforeEach(() => {
        app.use((req, res, next) => {
          // Return an OK value with a body, headers and cookies
          if (req.path === '/ok/value')
            res.value = {
              type: 'json',
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
              }
            };
          next();
        });
        server = app.listen(0);
      });

      it('should have the correct values', (done) => {
        request.get(
          'http://localhost::p/:v/:r',
          {
            p: server.address().port,
            v: 'ok',
            r: 'value'
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(val.headers.foo).to.equal('bar');
            expect(val.headers['set-cookie'][0]).to.equal(
              'Cook=blah; Path=/',
              'Cook2=duh; Path=/',
              'Cook3=hey; Path=/'
            );
            expect(val.body).to.equal('value');
            done();
          }
        );
      });
    });

    context('When an HTTP throws an error', () => {
      beforeEach(() => {
        app.get('/exception/request', (req, res) => {
          // Throw an exception
          throw new Error('Ooops');
        });
        server = app.listen(0);
      });

      it('should return 500 and the correct err message', (done) => {
        request.get(
          'http://localhost::p/:v/:r',
          {
            p: server.address().port,
            v: 'exception',
            r: 'request'
          },
          (err, val) => {
            expect(err.code).to.equal(500);
            expect(err.message).to.equal('Ooops');
            expect(val).to.equal(undefined);
            done();
          }
        );
      });
    });

    context('Sending an HTTP request to an nonexistent endpoint', () => {
      it('should return 404', (done) => {
        request.get(
          'http://localhost::p/:v/:r',
          {
            p: server.address().port,
            v: '404',
            r: 'request'
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(404);
            expect(val.body).to.deep.equal({
              error: 'notfound',
              message: 'Not found'
            });
            done();
          }
        );
      });
    });

    context('Sending an HTTP request, expecting log config info', () => {
      before(() => {
        debug.enable('abacus-express');
      });

      after(() => {
        debug.disable();
      });

      it('should return it in the body', (done) => {
        request.get(
          'http://localhost::p/debug',
          {
            p: server.address().port
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal({
              config: 'abacus-express'
            });
            done();
          }
        );
      });
    });
  });
});
