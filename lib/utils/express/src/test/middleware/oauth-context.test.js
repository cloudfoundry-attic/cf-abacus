'use strict';

/* eslint-disable */

const request = require('abacus-request');
const express = require('express');
const httpStatus = require('http-status-codes');
const jwt = require('jsonwebtoken');
const oauthContext = require('../../lib/middleware/oauth-context');

describe('oauth-context', () => {
  const sandbox = sinon.sandbox.create();
  const tokenSecret = '2DCQ@#R!Cyhj7nbs4t4fWbb34b';
  const tokenAlgorithm = 'HS256';

  let middlewareStub;
  let server;
  let authorization;

  const signToken = (authorities, scopes) => {
    const payload = {
      jti: 'fa1b29fe-76a9-4c2d-903e-dddd0563a9e3',
      sub: 'test-token',
      client_id: 'test-token',
      cid: 'test-token',
      azp: 'test-token',
      grant_type: 'client_credentials',
      iss: 'https://uaa.cf.net/oauth/token',
      zid: 'uaa',
      aud: ['abacus', 'account'],
      authorities: authorities,
      scope: scopes
    };
    return jwt.sign(payload, tokenSecret, {
      expiresIn: 43200
    });
  };

  beforeEach((done) => {
    middlewareStub = sandbox.stub().callsFake((req, res) => {
      res.send('ok');
    });

    const app = express();
    app.use(oauthContext(tokenSecret, tokenAlgorithm));
    app.use(middlewareStub);
    server = app.listen(0, done);
  });

  afterEach(() => {
    server.close();
    sandbox.restore();
  });

  const performGet = (cb) => {
    const settings = {
      port: server.address().port,
      auth: authorization
    };
    request.get('http://localhost::port/', settings, cb);
  };

  context('when request contains bearer authorization', () => {
    beforeEach(() => {
      const token = signToken([], ['abacus.usage.write']);
      authorization = {
        bearer: token
      };
    });

    it('should inject oauth data in request object for downstream middlewares', (done) => {
      performGet((err, res) => {
        expect(err).to.equal(undefined);
        expect(res.statusCode).to.equal(httpStatus.OK);

        assert.calledOnce(middlewareStub);
        const argReq = middlewareStub.firstCall.args[0];
        expect(argReq.context).to.not.equal(undefined);
        expect(argReq.context.oauth).to.not.equal(undefined);

        done();
      });
    });
  });

  context('when request contains invalid bearer authorization', () => {
    beforeEach(() => {
      const token = signToken([], ['abacus.usage.write']).substr(0, 5);
      authorization = {
        bearer: token
      };
    });

    it('should return an error', (done) => {
      performGet((err, res) => {
        expect(err).to.equal(undefined);
        expect(res.statusCode).to.equal(httpStatus.UNAUTHORIZED);

        assert.notCalled(middlewareStub);

        done();
      });
    });
  });

  context('when request does not contain bearer authorization', () => {
    beforeEach(() => {
      authorization = undefined;
    });

    it('should deledate call to downstream middlewares', (done) => {
      performGet((err, res) => {
        expect(err).to.equal(undefined);
        expect(res.statusCode).to.equal(httpStatus.OK);

        assert.calledOnce(middlewareStub);
        const argReq = middlewareStub.firstCall.args[0];
        expect(argReq.context).to.equal(undefined);

        done();
      });
    });
  });
});
