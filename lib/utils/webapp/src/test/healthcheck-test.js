'use strict';

const { extend } = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster);
const webapp = require('..');

describe('abacus-webapp healthcheck', () => {
  const sandbox = sinon.sandbox.create();
  const noAuthHeaders = {};
  const authHeaders = {
    authorization: 'Basic aW52YWxpZDpibGFibGE='
  };

  let server;

  const runServer = (cb) => {
    const app = webapp();
    server = app.listen(0, cb);
  };

  const verifyHealthCheck = (expectedStatusCode, headers, expectErr, done) => {
    request.get('http://localhost::p/healthcheck', {
      p: server.address().port,
      headers: headers
    }, (err, val) => {
      if (expectErr) expect(err.statusCode).to.equal(expectedStatusCode);
      else expect(val.statusCode).to.equal(expectedStatusCode);
      done();
    });
  };

  afterEach(() => {
    sandbox.restore();
  });

  context('with secured Abacus', () => {
    let basicStrategyMiddlewareStub;

    const startAppWithProtectedEndpoint = () => {
      const app = webapp();
      app.use(/^\/v1\/test/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));
      app.get('/v1/test', (req, resp) => {
        resp.send({ test: 123 });
      });
      server = app.listen(0);
    };

    beforeEach(() => {
      process.env.SECURED = 'true';

      basicStrategyMiddlewareStub = sandbox.stub();
      basicStrategyMiddlewareStub.callsFake((req, resp, next) => {
        next();
      });
      sandbox.stub(oauth, 'basicStrategy').callsFake(() => basicStrategyMiddlewareStub);
    });

    afterEach(() => {
      if (server)
        server.close();
    });

    context('and secured healthcheck', () => {
      beforeEach(() => {
        process.env.HEALTHCHECK_SECURED = 'true';
      });

      const testHealthCheck = () => {
        it('deny access, when error in acquiring token', (done) => {
          basicStrategyMiddlewareStub.callsFake((req, res, next) => {
            res.status(500).send({ statusCode: 500, error: 'error' });
          });
          verifyHealthCheck(500, authHeaders, true, done);
        });

        it('deny access, if UNAUTHORIZED', (done) => {
          basicStrategyMiddlewareStub.callsFake((req, res, next) => {
            res.status(401).send({ statusCode: 401 });
          });
          verifyHealthCheck(401, authHeaders, false, done);
        });

        it('deny access, when no credentials are sent', (done) => {
          basicStrategyMiddlewareStub.callsFake((req, res, next) => {
            res.status(401).send({ statusCode: 401 });
          });
          verifyHealthCheck(401, noAuthHeaders, false, done);
        });

        it('allows access to authorized user', (done) => {
          basicStrategyMiddlewareStub.callsFake((req, res, next) => {
            res.status(200).send({});
          });
          verifyHealthCheck(200, authHeaders, false, done);
        });
      };

      context('and default webapp', () => {
        beforeEach((done) => {
          runServer(done);
        });

        testHealthCheck();
      });

      context('and webapp with oauth protected endpoints', () => {
        beforeEach(() => {
          process.env.JWTKEY = 'secret';
          process.env.JWTALGO = 'HS256';

          startAppWithProtectedEndpoint();
        });

        testHealthCheck();
      });
    });

    context('and unsecured healthcheck', () => {
      beforeEach(() => {
        process.env.HEALTHCHECK_SECURED = 'false';
      });

      context('and default webapp', () => {
        beforeEach((done) => {
          runServer(done);
        });

        it('allows unauthorized access', (done) => {
          verifyHealthCheck(200, noAuthHeaders, false, done);
        });
      });

      context('and webapp with oauth protected endpoints', () => {
        beforeEach(() => {
          process.env.JWTKEY = 'secret';
          process.env.JWTALGO = 'HS256';

          startAppWithProtectedEndpoint();
        });

        it('allows unauthorized access', (done) => {
          verifyHealthCheck(200, noAuthHeaders, false, done);
        });
      });
    });
  });

  context('with not secured Abacus', () => {
    beforeEach((done) => {
      process.env.SECURED = 'false';

      runServer(done);
    });

    it('allows unauthorized access', (done) => {
      verifyHealthCheck(200, noAuthHeaders, false, done);
    });
  });
});
