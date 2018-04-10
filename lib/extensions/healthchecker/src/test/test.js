'use strict';

/* eslint-disable no-unused-expressions */

const _ = require('underscore');
const extend = _.extend;

const request = require('abacus-request');
const oauth = require('abacus-oauth');

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
    delete require.cache[require.resolve('abacus-vcapenv')];
    delete require.cache[require.resolve('abacus-urienv')];
  };

  beforeEach(() => {
    process.env.CF_API = 'http://api.localhost';
    process.env.CF_DOMAIN = 'cfapps.localhost';
    process.env.SECURED = false;
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
    stopHealthcheckServer();
  });

  const stubRequestGetWithError = (error = new Error('error')) => {
    sandbox.stub(request, 'get').yields(error);
  };

  const stubRequestGet = (statusCode) => {
    sandbox.stub(request, 'get').yields(undefined, { statusCode: statusCode });
  };

  const validateSuccessfulResponse = (error, response, expectedBody) => {
    expect(error).to.be.undefined;
    expect(response.statusCode).to.equal(httpStatus.OK);
    expect(response.body).to.eql(expectedBody);
  };

  it('returns status code 500, when invalid APPLICATION_GROUPS set', (done) => {
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
    const error = extend(new Error('error'), {
      noretry: true,
      nobreaker: true
    });
    stubRequestGetWithError(error);
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

  it('uses uri env to build uri, when no apps domain is provided', (done) => {
    stubRequestGet(httpStatus.OK);
    process.env.APPLICATION_GROUPS = `{
      "aggregator": 1,
      "collector": 1
    }`;
    delete process.env.CF_DOMAIN;

    startHealthcheckServer();

    request.get('http://localhost::p/v1/healthcheck', {
      p: server.address().port
    }, (error, response) => {
      validateSuccessfulResponse(error, response, {
        aggregator: { 'http://localhost:9080': httpStatus.OK },
        collector: { 'http://localhost:9080': httpStatus.OK }
      });

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

    afterEach(() => {
      delete process.env.SECURED;
      delete process.env.JWTKEY;
      delete process.env.JWTALGO;
      delete process.env.CLIENT_ID;
      delete process.env.CLIENT_SECRET;
      delete process.env.APPLICATION_GROUPS;
      delete process.env.CLIENT_SCOPES;
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
      sandbox.stub(oauth, 'basicStrategy').callsFake(() => (req, res, next) => next());

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
        expect(getSpy.firstCall.args[1].headers).to.include({ 'Authorization': 'Basic Y2xpZW50OnNlY3JldA==' });
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

  context('in CF environment', () => {
    beforeEach(() => {
      delete process.env.CF_DOMAIN;

      process.env.VCAP_APPLICATION = JSON.stringify({
        application_id: 'cf280f7c-8a9f-4813-a2a4-b8ddcc1cc6f3',
        application_name: 'abacus-healthchecker',
        application_uris: [
          'abacus-healthchecker.cfapps.localhost'
        ],
        cf_api: 'https://api.cfapps.localhost',
        name: 'abacus-healthchecker',
        space_id: 'b165cbc1-5196-4f64-8010-0259a05a8643',
        space_name: 'abacus',
        uris: [
          'abacus-healthchecker.cfapps.localhost'
        ],
        instance_index: 0,
        users: null,
        version: '7d4d6604-b750-4449-8760-21e4387b0c8d'
      });

      process.env.APPLICATION_GROUPS = `{
        "abacus-account-plugin": 1
        ,"abacus-services-bridge": 1
      }`;
    });

    it('returns status code 200 for every app', (done) => {
      const getStub = sandbox.stub(request, 'get');
      getStub
        .withArgs('https://abacus-account-plugin.cfapps.localhost/healthcheck')
        .yields(undefined, { statusCode: 200 });
      getStub
        .withArgs('https://abacus-services-bridge.cfapps.localhost/healthcheck')
        .yields(undefined, { statusCode: 500 });
      getStub
        .yields(undefined, { statusCode: 404 });

      startHealthcheckServer();

      request.get('http://localhost::p/v1/healthcheck', {
        p: server.address().port
      }, (error, response) => {
        validateSuccessfulResponse(error, response, {
          'abacus-account-plugin': {
            'https://abacus-account-plugin.cfapps.localhost':
            httpStatus.OK
          },
          'abacus-services-bridge': {
            'https://abacus-services-bridge.cfapps.localhost':
            httpStatus.INTERNAL_SERVER_ERROR
          }
        });
        done();
      });
    });
  });

});
