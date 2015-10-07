'use strict';

// Simple wrapper around the popular Node request module

const _ = require('underscore');
const http = require('http');
const batch = require('abacus-batch');

const map = _.map;

const request = require('..');

describe('abacus-request', () => {
  it('sends HTTP requests', (done) => {
    // Create a test HTTP server
    let gets = 0;
    const server = http.createServer((req, res) => {
      if(req.url === '/ok/request' && req.method === 'OPTIONS')
        // Return an OK response with a body
        res.end('okay');
      else if(req.url === '/ok/request' && req.method === 'GET')
        // Return an OK response with a body
        res.end(gets++ === 0 ? 'okay' : 'notok');
      else if(req.url === '/500/request' && req.method === 'POST') {
        // Don't return a body here to test request's behavior
        // without a body
        res.statusCode = 500;
        res.end();
      }
      else if(req.url === '/err/request' && req.method ===
        'POST') {
        // Return a JSON object with a message field, to test
        // request's ability to pick up that message
        let body = '';
        req.on('data', (chunk) => {
          body = body + chunk;
        });
        req.on('end', () => {
          res.statusCode = 500;
          res.setHeader('Content-type', 'application/json');
          res.end(JSON.stringify({
            message: JSON.parse(body)
          }));
        });
      }
    });

    // Listen on an ephemeral port
    server.listen(0);

    // Wait for the server to become available
    request.waitFor('http://localhost::p/ok/request', {
      p: server.address().port
    }, (err, val) => {
      if(err)
        throw err;

      let cbs = 0;
      const done1 = () => {
        if(++cbs === 4) done();
      };

      // Send an HTTP request, expecting an OK response
      request.get('http://localhost::p/:v/:r', {
        cache: true,
        p: server.address().port,
        v: 'ok',
        r: 'request'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.equal('okay');
        done1();

        // Send an HTTP request, expecting a cached OK response
        request.get('http://localhost::p/:v/:r', {
          cache: true,
          p: server.address().port,
          v: 'ok',
          r: 'request'
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal('okay');
          done1();
        });
      });

      // Send an HTTP request, expecting a 500 status code
      // Here test the option to pass the URI as a field of the options object
      request.post({
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
      request.post('http://localhost::p/:v/:r', {
        p: server.address().port,
        v: 'err',
        r: 'request',
        body: 'duh'
      }, (err, val) => {
        expect(err.message).to.equal('duh');
        expect(val).to.equal(undefined);
        done1();
      });
    });
  });

  it('reports connection errors', (done) => {
    // Send an HTTP request to port 1, expecting a connection error
    request.get('http://localhost:1/connect', (err, val) => {
      expect(err.code).to.equal('ECONNREFUSED');
      expect(err.errno).to.equal('ECONNREFUSED');
      expect(err.syscall).to.equal('connect');
      expect(val).to.equal(undefined);
      done();
    });
  });

  it('batches HTTP requests', (done) => {
    // Create a test HTTP server
    let gets = 0;
    const server = http.createServer((req, res) => {
      // Handle batched requests
      if(req.url === '/batch') {
        // Read the posted batch
        let json = '';
        req.on('data', (chunk) => {
          json = json + chunk;
        }).on('end', () => {
          const body = json.length ? JSON.parse(json) : [];

          // Execute the list of requests from the batch
          const bres = map(body, (breq) => {
            if(breq.uri === '/ok/request' && breq.method ===
              'GET')
              // Return an OK response with a body
              return {
                statusCode: 200,
                body: gets++ === 0 ? 'okay' : 'notok'
              };
            if(breq.uri === '/201/request' && breq.method ===
              'POST')
              // Return 201 response with location
              return {
                statusCode: 201,
                header: { Location: '201/request/1' }
              };
            else if(breq.uri === '/500/request' && breq.method ===
              'POST')
              // Don't return a body here to test request's behavior
              // without a body
              return {
                statusCode: 500
              };
            else if(breq.uri === '/err/request' && breq.method ===
              'POST')
              // Return a JSON object with a message field, to test
              // request's ability to pick up that message
              return {
                statusCode: 500,
                body: {
                  message: breq.body
                }
              };
          });

          // Send the batch of results
          res.setHeader('Content-type', 'application/json');
          res.end(JSON.stringify(bres ? bres : []));
        });
      }
    });

    // Listen on an ephemeral port
    server.listen(0);

    // Wait for the server to become available
    request.waitFor('http://localhost::p/batch', {
      p: server.address().port
    }, (err, val) => {
      if(err)
        throw err;

      let cbs = 0;
      const done1 = () => {
        if(++cbs === 5) done();
      };

      // Use a batch version of the request module
      const brequest = batch(request);

      // Send an HTTP request, expecting an OK response
      brequest.get('http://localhost::p/:v/:r', {
        cache: true,
        p: server.address().port,
        v: 'ok',
        r: 'request'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.equal('okay');
        done1();

        brequest.get('http://localhost::p/:v/:r', {
          cache: true,
          p: server.address().port,
          v: 'ok',
          r: 'request'
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal('okay');
          done1();
        });
      });

      // Send an HTTP request, expecting a 201 response with location
      brequest.post({ uri: 'http://localhost::p/:v/:r',
        p: server.address().port, v: '201', r: 'request' }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(201);
          expect(val.headers.location).to.equal('201/request/1');
          done1();
        });

      // Send an HTTP request, expecting a 500 status code
      // Here test the option to pass the URI as a field of the options object
      brequest.post({ uri: 'http://localhost::p/:v/:r',
        p: server.address().port, v: '500', r: 'request' }, (err, val) => {
          expect(err.message).to.equal('HTTP response status code 500');
          expect(val).to.equal(undefined);
          done1();
        });

      // Send an HTTP request, expecting an error message
      brequest.post('http://localhost::p/:v/:r', { p: server.address().port,
        v: 'err', r: 'request', body: 'duh' }, (err, val) => {
          expect(err.message).to.equal('duh');
          expect(val).to.equal(undefined);
          done1();
        });
    });
  });

  it('batches HTTP request to a server that does not support batch', (done) => {
    // Create a test HTTP server
    const server = http.createServer((req, res) => {
      if (req.url === '/batch') {
        // Return 404
        res.statusCode = 404;
        res.setHeader('Content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    // Listen on an ephemeral port
    server.listen(0);

    // Wait for the server to become available
    request.waitFor('http://localhost::p/batch', {
      p: server.address().port
    }, (err, val) => {
      if(err)
        throw err;

      // Use a batch version of the request module
      const brequest = batch(request);

      // Send an HTTP request, expecting a 404 response
      brequest.get('http://localhost::p/:v/:r', {
        cache: true,
        p: server.address().port,
        v: 'notfound',
        r: 'request'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(405);
        expect(val.body).to.deep.equal({ error: 'Not found' });
        done();
      });
    });
  });

  it('batches HTTP requests using valid and invalid authorization tokens',
    (done) => {
      let batches = 0;
      // Create a test HTTP server
      const server = http.createServer((req, res) => {
        // Handle batched requests
        if (req.url === '/batch') {
          if (req.headers.authorization) batches++;

          if (req.headers.authorization === 'Bearer valid') {
            res.statusCode = 200;
            res.setHeader('Content-type', 'application/json');
            res.end(JSON.stringify([{ statusCode: 200, body: 'okay' }]));
          }
          else {
            res.statusCode = 401;
            res.setHeader('WWW-Authenticate', 'Bearer')
            res.end();
          }
        }
      });

      // Listen on an ephemeral port
      server.listen(0);

      // Wait for the server to become available
      request.waitFor('http://localhost::p/batch', {
        p: server.address().port
      }, (err, val) => {
        if(err)
          throw err;

        let cbs = 0;
        const done1 = () => {
          if(++cbs === 2) {
            expect(batches).to.equal(2);
            done();
          }
        };

        // Use a batch version of the request module
        const brequest = batch(request);

        // Send an HTTP request, expecting an OK response
        brequest.get('http://localhost::p/:v/:r', {
          p: server.address().port,
          v: 'ok',
          r: 'request',
          headers: {
            authorization: 'Bearer valid'
          }
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal('okay');
          done1();
        });

        brequest.get('http://localhost::p/:v/:r', {
          p: server.address().port,
          v: 'ok',
          r: 'request',
          headers: {
            authorization: 'Bearer invalid'
          }
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          expect(val.headers['www-authenticate']).to.equal('Bearer');
          done1();
        });
      });
    });
});
