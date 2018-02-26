'use strict';

/* eslint-disable max-len*/
const config = require('../config');
const logger = require('../utils/dashboardLogger');
const moment = require('abacus-moment');

class AuthenticationController {
  constructor() { }

  parseToken(token) {
    return token.split('.').slice(0, 2).map((part) => {
      return JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
    });
  }

  checkAccessTokenExpired(req) {
    let token = req.session.uaa_response.parsed_token;
    let remainingTime = token[1].exp - Math.floor(moment.now() / 1000);
    // destroy session before 5 min to expiry
    if (remainingTime < 300) {
      logger.debug('session expired. Calling req logout');
      req.logOut();
      return true;
    }
    return false;
  }

  getConfigurationOptions() {
    logger.debug('authorization url is ', config.cf.authorize_url);
    logger.debug('token url is ', config.cf.token_url);
    return {
      authorizationURL: config.cf.authorize_url,
      tokenURL: config.cf.token_url,
      clientID: config.cf.client_id,
      clientSecret: config.cf.client_secret,
      proxy: config.trust_proxy,
      passReqToCallback: true
    };
  }

  getAuthCallbackFn() {
    let that = this;
    return function(req, accessToken, refreshToken, uaaResponse, profile, done) {
      logger.debug('succcessfully generated oauth token');
      req.session.uaa_response = uaaResponse;
      req.session.uaa_response.parsed_token = that.parseToken(accessToken);
      done(null, profile);
    };
  }
}

module.exports = AuthenticationController;
