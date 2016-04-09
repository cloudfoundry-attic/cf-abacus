'use strict';

// A simple Web proxy with a minimalistic round-bobbin load balancing and
// HTTPS support.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const webapp = require('abacus-webapp');
const webproxy = require('..');

describe('abacus-webproxy', () => {
  it('proxies Web requests', (done) => {
    // Create test Webapps
    const app1 = webapp();
    const app2 = webapp();

    // Add test routes
    app1.get('/app1/request', (req, res) => {
      // Return an OK response with a body
      res.send('okay app1');
    });
    app2.get('/app2/request', (req, res) => {
      // Return an OK response with a body
      res.send('okay app2');
    });

    // Listen on ephemeral ports
    const server1 = app1.listen(0);
    const server2 = app2.listen(0);

    // Create test proxy
    const proxy = webproxy([
      'http://localhost:' + server1.address().port + '/app1',
      'http://localhost:' + server2.address().port + '/app2'
    ]);

    // Listen on an ephemeral port
    const server = proxy.listen(0);

    let cbs = 0;
    const done1 = () => {
      if(++cbs === 3)
        done();
    };

    // Send HTTP requests, expecting OK responses
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'app1',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay app1');
      done1();
    });

    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'app2',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.equal('okay app2');
      done1();
    });

    // Expect a 404 response
    request.get('http://localhost::p/:v/:r', {
      p: server.address().port,
      v: 'foo',
      r: 'request'
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(404);
      done1();
    });
  });
});

