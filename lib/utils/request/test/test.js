'use strict';

// Simple wrapper around the popular Node request module

const request = require('..');
const http = require('http');

describe('cf-abacus-request', () => {
    it('sends HTTP requests', (done) => {
        // Create a test HTTP server
        const server = http.createServer((req, res) => {
            if (req.url === '/ok/request')
                // Return an OK response with a body
                res.end('okay');
            else if(req.url === '/500/request') {
                // Don't return a body here to test request's behavior
                // without a body
                res.statusCode = 500;
                res.end();
            }
            else if(req.url === '/err/request') {
                // Return a JSON object with a message field, to test
                // request's ability to pick up that message
                let body = '';
                req.on('data', (chunk) => {
                    body = body + chunk;
                });
                req.on('end', () => {
                    res.statusCode = 500;
                    res.setHeader('Content-type', 'application/json');
                    res.end('{ "message": ' + body + ' }');
                });
            }
        });

        // Listen on an ephemeral port
        server.listen(0);

        // Wait for the server to become available
        request.waitFor('http://localhost::p/ok/request', { p: server.address().port }, (err, val) => {
            if(err) throw err;

            let cbs = 0;
            const done1 = () => {
                if(++cbs === 3) done();
            };

            // Send an HTTP request, expecting an OK response
            request.get('http://localhost::p/:v/:r', { p: server.address().port, v: 'ok', r: 'request' }, (err, val) => {
                expect(err).to.equal(undefined);
                expect(val.statusCode).to.equal(200);
                expect(val.body).to.equal('okay');
                done1();
            });

            // Send an HTTP request, expecting a 500 status code
            // Here test the option to pass the URI as a field of the options object
            request.post({ uri: 'http://localhost::p/:v/:r', p: server.address().port, v: '500', r: 'request' }, (err, val) => {
                expect(err.message).to.equal('HTTP response status code 500');
                expect(val).to.equal(undefined);
                done1();
            });

            // Send an HTTP request, expecting an error message
            request.post('http://localhost::p/:v/:r', { p: server.address().port, v: 'err', r: 'request', body: 'duh' }, (err, val) => {
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
});

