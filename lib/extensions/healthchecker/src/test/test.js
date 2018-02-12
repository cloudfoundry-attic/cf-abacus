'use strict';

/* eslint-disable no-unused-expressions */

const _ = require('underscore');
const extend = _.extend;

const request = require('abacus-request');
const oauth = require('abacus-oauth');
const urienv = require('abacus-urienv');

const cluster = require('abacus-cluster');
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const httpStatus = require('http-status-codes');

describe('Abacus healthchecker', () => {
  let sandbox;
  let server;
  let healthchecker;

  const startHealthcheckServer = () => {
    healthchecker = require('..');
    const app = healthchecker();
    server = app.listen(0);
    sandbox.restore();
  };

  const stopHealthcheckServer = () => {
    if (server)
      server.close();
    delete require.cache[require.resolve('..')];
  };

  afterEach(() => {
    sandbox.restore();
    stopHealthcheckServer();
  });

  beforeEach(() => {
    process.env.CF_API = 'http://api.localhost';
    process.env.CF_DOMAIN = 'cfapps.localhost';
    process.env.SECURED = false;
    sandbox = sinon.sandbox.create();
  });

  const stubRequestGetWithError = (error) => {
    sandbox.stub(request, 'get').yields(new Error('error'));
  };

  const stubRequestGet = (statusCode) => {
    sandbox.stub(request, 'get').yields(undefined, { statusCode: statusCode });
  };

  const validateSuccessfulResponse = (error, response, expectedBody) => {
    expect(error).to.be.undefined;
    expect(response.statusCode).to.equal(httpStatus.OK);
    expect(response.body).to.eql(expectedBody);
  };

  it('returns status code 500, when invalid APPLICATION_GROUPS set',
    (done) => {
      process.env.APPLICATION_GROUPS = 'invalid-json';

      startHealthcheckServer();

      request.get('http://localhost::p/v1/healthcheck', {
        p: server.address().port
      }, (error, response) => {
        expect(error.statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
        done();
      });
    });

  it('should wrap the error, when request returns an error', (done) => {
    stubRequestGetWithError(new Error('error'));
    process.env.APPLICATION_GROUPS = `{
      "aggregator": 1
    }`;

    startHealthcheckServer();

    request.get('http://localhost::p/v1/healthcheck', {
      p: server.address().port
    }, (error, response) => {
      validateSuccessfulResponse(error, response, {
        'aggregator': {
          'http://aggregator.cfapps.localhost': httpStatus.INTERNAL_SERVER_ERROR
        }
      });
      done();
    });
  });

  it('should use uri env to build domain, when no apps domain is exported',
    (done) => {
      stubRequestGet(httpStatus.OK);
      process.env.APPLICATION_GROUPS = `{
        "aggregator": 1,
        "collector": 1
      }`;
      delete process.env.CF_DOMAIN;
      const uriUrlSpy = sandbox.spy(urienv, 'url');

      startHealthcheckServer();

      request.get('http://localhost::p/v1/healthcheck', {
        p: server.address().port
      }, (error, response) => {
        expect(error).to.be.undefined;
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(uriUrlSpy.called).to.be.true;
        expect(uriUrlSpy.calledWith('aggregator')).to.be.true;
        expect(uriUrlSpy.calledWith('collector')).to.be.true;
        done();
      });
    });

  context('when apps are healthy', () => {

    beforeEach(() => {
      stubRequestGet(httpStatus.OK);
    });

    it('returns status code 200 for every app, when APPLICATION_GROUPS ' +
      'have just one instance per group', (done) => {
      process.env.APPLICATION_GROUPS = `{
        "aggregator": 1,
        "collector": 1
      }`;

      startHealthcheckServer();

      request.get('http://localhost::p/v1/healthcheck', {
        p: server.address().port
      }, (error, response) => {
        validateSuccessfulResponse(error, response, {
          'aggregator': {
            'http://aggregator.cfapps.localhost': httpStatus.OK
          },
          'collector': {
            'http://collector.cfapps.localhost': httpStatus.OK
          }
        });
        done();
      });
    });

    it('returns status code 200 for every app, when APPLICATION_GROUPS ' + 
      'have multiple instances per group', (done) => {
      process.env.APPLICATION_GROUPS = `{
        "collector": 1,
        "aggregator": 2
      }`;

      startHealthcheckServer();

      request.get('http://localhost::p/v1/healthcheck', {
        p: server.address().port
      }, (error, response) => {
        validateSuccessfulResponse(error, response, {
          'aggregator': {
            'http://aggregator-0.cfapps.localhost': httpStatus.OK,
            'http://aggregator-1.cfapps.localhost': httpStatus.OK
          },
          'collector': {
            'http://collector.cfapps.localhost': httpStatus.OK
          }
        });
        done();
      });
    });

  });

  context('when an app is unhealthy', () => {

    beforeEach(() => {
      process.env.APPLICATION_GROUPS = `{
        "aggregator": 1,
        "collector": 1
      }`;
    });

    it('returns status code 200 for every app, when APPLICATION_GROUPS ' +
      'have just one instance per group', (done) => {
      const getStub = sandbox.stub(request, 'get');
      getStub.withArgs('http://aggregator.cfapps.localhost/healthcheck')
        .yields(undefined, { statusCode: 200 });
      getStub.withArgs('http://collector.cfapps.localhost/healthcheck')
        .yields(undefined, { statusCode: 500 });

      startHealthcheckServer();

      request.get('http://localhost::p/v1/healthcheck', {
        p: server.address().port
      }, (error, response) => {
        validateSuccessfulResponse(error, response, {
          'aggregator': {
            'http://aggregator.cfapps.localhost': 
              httpStatus.OK
          },
          'collector': {
            'http://collector.cfapps.localhost': 
              httpStatus.INTERNAL_SERVER_ERROR
          }
        });
        done();
      });
    });

  });

  context('when environment is SECURED', () => {
    const tokenSecret = 'secret';
    const tokenAlgorithm = 'HS256';

    beforeEach(() => {
      process.env.SECURED = true;
      process.env.JWTKEY = tokenSecret;
      process.env.JWTALGO = tokenAlgorithm;
      process.env.CLIENT_ID = 'client';
      process.env.CLIENT_SECRET = 'secret';
      process.env.APPLICATION_GROUPS = `{
        "aggregator": 1
      }`;
      process.env.CLIENT_SCOPES = 'abacus.system.read';
    });

    it('should call basic strategy validator', () => {
      const basicSpy = sandbox.spy(oauth, 'basicStrategy');

      startHealthcheckServer();

      expect(basicSpy.called).to.be.true;
      expect(basicSpy.firstCall.args).to.eql([process.env.CF_API,
        process.env.CLIENT_SCOPES, tokenSecret, tokenAlgorithm]);
    });

    it('should set basic auth header', (done) => {
      const getSpy = sandbox.spy(request, 'get');
      sandbox.stub(oauth, 'basicStrategy').callsFake(() =>
        (req, res, next) => next());

      startHealthcheckServer();

      request.get('http://localhost::p/v1/healthcheck', {
        headers: {
          authorization: 'Basic some_token'
        },
        p: server.address().port
      }, (error, response) => {
        expect(error).to.be.undefined;
        expect(response.statusCode).to.equal(httpStatus.OK);
        expect(getSpy.called).to.be.true;
        expect(getSpy.firstCall.args[1].headers)
          .to.include({ 'Authorization': 'Basic Y2xpZW50OnNlY3JldA==' });
        done();
      });
    });

    it('returns status code 401 when token is invalid', (done) => {
      const getSpy = sandbox.spy(request, 'get');

      startHealthcheckServer();

      request.get('http://localhost::p/v1/healthcheck', {
        headers: {
          authorization: 'bearer invalid'
        },
        p: server.address().port
      }, (error, response) => {
        expect(error).to.be.undefined;
        expect(response.statusCode).to.equal(401);
        expect(getSpy.called).to.be.false;
        done();
      });
    });
  });
});
