'use strict';

const { extend } = require('underscore');
const request = require('abacus-request');
const { OK: STATUS_OK, UNAUTHORIZED: STATUS_UNAUTHORIZED } = require('http-status-codes');
const jwt = require('jsonwebtoken');

const webapp = require('..');

describe('abacus-webapp metrics', () => {
  let server;

  const runServer = (cb) => {
    const app = webapp();
    server = app.listen(0, cb);
  };

  const getMetrics = (token, cb) => {
    const headers = {};
    if (token)
      headers.authorization = `Bearer ${token}`;

    request.get('http://localhost::p/v1/metrics', {
      p: server.address().port,
      headers: headers
    }, cb);
  };

  const verifyMetricsInaccessible = (token, done) => {
    getMetrics(token, (err, resp) => {
      expect(err).to.equal(undefined);
      expect(resp.statusCode).to.equal(STATUS_UNAUTHORIZED);
      done();
    });
  };

  const verifyMetricsAccessible = (token, done) => {
    getMetrics(token, (err, resp) => {
      expect(err).to.equal(undefined);
      expect(resp.statusCode).to.equal(STATUS_OK);
      expect(resp.body).to.deep.equal({
        bulletins: {},
        counters: {},
        gauges: {}
      });
      done();
    });
  };

  beforeEach(() => {
    server = null;
  });

  afterEach(() => {
    if (server) server.close();
  });

  context('when not secured', () => {
    beforeEach((done) => {
      runServer(done);
    });

    it('is possible to access metrics without credentials', (done) => {
      const token = null;
      verifyMetricsAccessible(token, done);
    });
  });

  context('when secured', () => {
    const tokenSecret = '2DCQ@#R!Cyhj7nbs4t4fWbb34b';
    const tokenAlgorithm = 'HS256';

    const signToken = (authorities, scopes) => {
      const payload = extend(
        {
          jti: 'fa1b29fe-76a9-4c2d-903e-dddd0563a9e3',
          sub: 'test-token',
          client_id: 'test-token',
          cid: 'test-token',
          azp: 'test-token',
          grant_type: 'client_credentials',
          iss: 'https://uaa.cf.net/oauth/token',
          zid: 'uaa',
          aud: ['abacus', 'account']
        },
        {
          authorities: authorities,
          scope: scopes
        }
      );
      return jwt.sign(payload, tokenSecret, {
        expiresIn: 43200
      });
    };

    beforeEach((done) => {
      process.env.SECURED = 'true';
      process.env.JWTKEY = tokenSecret;
      process.env.JWTALGO = tokenAlgorithm;
      runServer(done);
    });

    afterEach(() => {
      delete process.env.SECURED;
      delete process.env.JWTKEY;
      delete process.env.JWTALGO;
    });

    it('is not possible to access metrics without credentials', (done) => {
      const token = null;
      verifyMetricsInaccessible(token, done);
    });

    it('is possible to access metrics with credentials', (done) => {
      const permissions = ['abacus.system.read'];
      const token = signToken(permissions, permissions);
      verifyMetricsAccessible(token, done);
    });
  });
});
