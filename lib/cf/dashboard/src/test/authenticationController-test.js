'use strict';
require('./lib/index.js');
const auth = require('../auth');
const controller = auth.authConfigCtrl;
const CFStrategy = auth.passportStrategy;
const passport = require('passport');

describe('AuthenticationController', () => {
  it('should test getConfigurationOptions', (done) => {
    let configSpy = sinon.spy(controller, 'getConfigurationOptions');
    let config = controller.getConfigurationOptions();
    sinon.assert.calledOnce(configSpy);
    let testConfig = {
      authorizationURL: 'https://login.com/oauth/authorize',
      clientID: 'test_client',
      clientSecret: 'secret',
      passReqToCallback: true,
      proxy: true,
      tokenURL: 'https://login.com/oauth/token'
    };
    expect(config).to.be.an('object');
    expect(config).to.deep.equal(testConfig);
    configSpy.restore();
    done();
  });

  it('should test getAuthCallbackFn', (done) => {
    let callbackSpy = sinon.spy(controller, 'getAuthCallbackFn');
    let callbackFn = controller.getAuthCallbackFn();
    sinon.assert.calledOnce(callbackSpy);
    expect(callbackFn).to.be.a('function');
    // call the function
    let req = {
      session: {
      }
    };
    let donecb = sinon.stub();
    let token = 'eyJleHAiOiIxMjM0NSJ9.eyJleHAiOiIxMjM0NSJ9';
    callbackFn(req, token, 'abcd1234', {}, {}, donecb);
    expect(req.session.uaa_response.parsed_token[1].exp).to.equal('12345');
    sinon.assert.called(donecb);
    callbackSpy.restore();
    done();
  });

  describe('checkAccessTokenExpired', () => {
    let checkTokenExpirySpy, logoutSpy, mathStub;
    let req = {};
    req.session = {};
    req.session.uaa_response = {
      parsed_token: [0, { exp: 200 }]
    };
    req.logOut = () => { };
    beforeEach(() => {
      checkTokenExpirySpy = sinon.spy(controller, 'checkAccessTokenExpired');
      logoutSpy = sinon.spy(req, 'logOut');
      mathStub = sinon.stub(Math, 'floor', () => {
        return 0;
      });
    });

    afterEach(() => {
      checkTokenExpirySpy.restore();
      logoutSpy.restore();
      mathStub.restore();
    });

    it('should test checkAccessTokenExpired returns true', (done) => {
      let isTokenExpired = controller.checkAccessTokenExpired(req);
      sinon.assert.calledOnce(checkTokenExpirySpy);
      expect(isTokenExpired, true);
      sinon.assert.calledOnce(logoutSpy);
      done();
    });

    it('should test checkAccessTokenExpired returns false', (done) => {
      req.session.uaa_response.parsed_token[1].exp = 5000;
      let isTokenExpired = controller.checkAccessTokenExpired(req);
      sinon.assert.calledOnce(checkTokenExpirySpy);
      expect(isTokenExpired, false);
      sinon.assert.notCalled(logoutSpy);
      done();
    });



  });
});

describe('authentication', () => {
  it('should test strategy', (done) => {
    let configSpy = sinon.spy(controller, 'getConfigurationOptions');
    let authcbFnSpy = sinon.spy(controller, 'getAuthCallbackFn');
    let serializeStub = sinon.stub(passport, 'serializeUser');
    let deserializeStub = sinon.stub(passport, 'deserializeUser');
    let strategy = CFStrategy();
    sinon.assert.calledOnce(serializeStub);
    sinon.assert.calledOnce(deserializeStub);
    sinon.assert.calledOnce(configSpy);
    sinon.assert.calledOnce(authcbFnSpy);
    expect(strategy.name).to.equal('oauth2');
    done();
  });
});

