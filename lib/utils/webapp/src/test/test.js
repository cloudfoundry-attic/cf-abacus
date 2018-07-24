'use strict';

const { extend } = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

describe('abacus-webapp', () => {
  let webapp;

  const setUpWebapp = (isWorker) => {
    require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster, {
      isWorker: () => isWorker
    });
    delete require.cache[require.resolve('..')];
    webapp = require('..');
  };

  context('with no set connection timeout', () => {
    beforeEach(() => {
      setUpWebapp(true);
    });

    it('sets up an Express Webapp with a set of selected middleware', (done) => {
      const app = webapp();
      app.get('/request', (req, res) => {
        res.send('okay');
      });
      const server = app.listen(0);

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

  context('with a set connection timeout', () => {
    const smallValue = 20;
    const bigValue = 30;

    let server;

    const setUp = (connectionTimeout, responseTimeInMillis) => {
      process.env.CONNECTION_TIMEOUT = connectionTimeout;

      let app = webapp();
      app.get('/request', (req, res) => {
        setTimeout(() => {
          res.send('okay');
        }, responseTimeInMillis);
      });
      server = app.listen(0);
    };

    context('in case webapp is master', () => {
      beforeEach(() => {
        setUpWebapp(false);
        setUp(bigValue, smallValue);
      });

      it('connection timeout stays default', () => {
        // Default is 2 minutes: https://nodejs.org/api/http.html#http_server_timeout
        expect(server.timeout).to.equal(120000);
      });
    });

    context('in requests taking less time than configured timeout', () => {
      beforeEach(() => {
        setUpWebapp(true);
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

      it('server should have correct connection timeout value set', () => {
        expect(server.timeout).to.equal(bigValue);
      });
    });

    context('in requests taking more time than configured timeout', () => {
      beforeEach(() => {
        setUpWebapp(true);
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
