'use strict';
/* eslint-disable complexity*/
const passport = require('passport');
const authController = require('../auth').authConfigCtrl;
const urlParser = require('../utils/urlParser');
const debug = require('abacus-debug')('abacus-dashboard');
const _ = require('underscore');

const authenticate = {
  ensureAuthenticated: (req, res, next) => {
    if (req.isAuthenticated() && !authController.checkAccessTokenExpired(req))
      return next();
    const path = urlParser.getPath(req.originalUrl);

    // request is ajaxHttpRequest
    if(req.get('X-WebApp-Request') === 'true' || path === '/v1/logout') {
      debug('X-WebApp-Request header is set to %s',req.get('X-WebApp-Request'));
      debug('req path is %s',path);
      req.logout();
      debug('getting query param instance_id %s', req.query.instance_id);
      // inturn redirect to UAA login with valid callbackuri
      if (!_.isUndefined(req.query.instance_id)) {
        debug('getting query param instance_id %s', req.query.instance_id);
        return res.redirect(`/manage/instances/${req.query.instance_id}`);
      }else if(req.query.force === true) {
        // redirec UAA login anyways
        debug('force query param is set to %s',req.query.force);
        return authenticate.passportAuthenticate(req,res,next);
      }
      // destroy session for the first time and send expiry header
      return req.session.destroy((err) => {
        debug('sesssion expired setting expiry header');
        res.setHeader('X-Session-Expiry', 'true');
        res.status(401).json({});
      });
    }
    // redirect to UAA with valid callbackuri else just take to UAA Login
    if(!_.isUndefined(req.params.instance_id))
      return res.redirect(`/manage/instances/${req.params.instance_id}`);
    return authenticate.passportAuthenticate(req,res,next);
  },
  isAuthenticated: (req) => {
    return req.isAuthenticated();
  },
  passportAuthenticate: (req,res,next) => {
    return passport.authenticate(
      'oauth2', {
        successReturnToOrRedirect: req.originalUrl,
        callbackURL: req.originalUrl
      }
    )(req, res, next);  
  }
};

module.exports = authenticate;
