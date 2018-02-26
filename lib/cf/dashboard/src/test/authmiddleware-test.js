'use strict';
/* eslint-disable max-len*/
require('./lib/index.js');
const auth = require('../middleware/authMiddleware');
const authController = require('../auth').authConfigCtrl;
const passport = require('passport');
const req = {
  isAuthenticated: () => {
    return true;
  }
};
const res = {};

describe('lib', () => {

  after(() => {
    delete require.cache[require.resolve('../middleware/authMiddleware')];
  });

  describe('middleware', () => {
    describe('authmiddleware', () => {
      describe('should call next if authenticated and no access_token expired', () => {
        let authSpy, next, accessTokenStub;
        beforeEach(() => {
          authSpy = sinon.spy(auth, 'ensureAuthenticated');
          accessTokenStub = sinon.stub(authController, 'checkAccessTokenExpired');
          next = sinon.stub();
        });
        afterEach(() => {
          authSpy.restore();
          accessTokenStub.restore();

        });
        it('should call next on authenticate', (done) => {
          accessTokenStub.returns(false);
          auth.ensureAuthenticated(req, res, next);
          expect(authSpy.calledOnce).to.equal(true);
          expect(next.called).to.equal(true);
          done();
        });
      });
    });

    describe('authmiddleware unauthenticated/accesstokenexpired', () => {
      let authSpy, passportSpy, next, checkAccessTokenExpiredStub;
      let passportAuthStub;
      beforeEach(() => {
        authSpy = sinon.spy(auth, 'ensureAuthenticated');
        passportSpy = sinon.spy(passport, 'authenticate');
        req.originalUrl = 'http://demo';
        req.isAuthenticated = () => {
          return false;
        };
        req.params = {};
        req.query = {};
        req.get = sinon.stub();
        req.logout = sinon.stub();
        req.session = { destroy : sinon.stub() };
        res.setHeader = sinon.stub();
        res.status = sinon.stub();
        res.json = sinon.stub();
        res.redirect = sinon.stub();
        checkAccessTokenExpiredStub = sinon.stub(authController, 'checkAccessTokenExpired');
        passportAuthStub = sinon.stub(auth,'passportAuthenticate');
        next = sinon.stub();
      });

      afterEach(() => {
        authSpy.restore();
        passportSpy.restore();
        checkAccessTokenExpiredStub.restore();
        passportAuthStub.restore();
      });

      it('should call passport authenticated when not authorized', (done) => {
        passportAuthStub.restore();
        auth.passportAuthenticate(req,res,next);
        sinon.assert.calledWith(passportSpy, 'oauth2', {
          successReturnToOrRedirect: req.originalUrl,
          callbackURL: req.originalUrl
        });
        done();
      });

      it('should call req logOut and send 401 unauthorized' ,(done)=> {
        req.session.destroy.callsArg(0);
        req.get.returns('true');
        res.status.returns(res);
        auth.ensureAuthenticated(req,res,next);
        sinon.assert.called(req.logout);
        sinon.assert.calledWith(req.get, 'X-WebApp-Request');
        sinon.assert.calledWith(res.setHeader,'X-Session-Expiry','true');
        sinon.assert.calledWith(res.status,401);
        sinon.assert.calledWith(res.json,{});
        done();
      });

      it('should redirect to /manage/instance/instanceId',(done)=>{
        req.originalUrl = 'https://service-dashboard.com/v1/logout?instance_id=abcd12345';
        req.query.instance_id = 'abcd12345';
        auth.ensureAuthenticated(req,res,next);
        sinon.assert.calledWith(res.redirect, '/manage/instances/abcd12345');
        done();
      });

      it('should redirect to passport autheticate if no instance_id is found', (done)=>{
        req.originalUrl = 'https://service-dashboard.com/v1/logout?force=true';
        req.query.force = true;
        auth.ensureAuthenticated(req,res,next);
        sinon.assert.calledWith(passportAuthStub,req,res,next);
        done();
      });

      it('should redirect to /manage/instance/abcd12345 if part of req param', (done) => {
        req.originalUrl = 'http://service.dashboard.com/manage/instances/xyz1234';
        req.params.instance_id = 'xyz1234';
        auth.ensureAuthenticated(req,res,next);
        sinon.assert.calledWith(res.redirect,'/manage/instances/xyz1234');
        done();
      });

      it('should redirect all random path to passport authenticate', (done) => {
        res.originalUrl = 'http://service.dashboard.com/abc/xyz';
        auth.ensureAuthenticated(req,res,next);
        sinon.assert.calledWith(passportAuthStub,req,res,next);
        done();
      });
    });
  });
});
