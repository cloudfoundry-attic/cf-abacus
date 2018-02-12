'use strict';

const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const authController = require('../auth').authConfigCtrl;
const HttpsProxyAgent = require('https-proxy-agent');


const CFStrategy = () => {
  passport.serializeUser((user, done) => {
    done(null, user);
  });
  passport.deserializeUser((user, done) => {
    done(null, user);
  });
  let configOptions = authController.getConfigurationOptions;
  let callbackFn = authController.getAuthCallbackFn();
  const strategy = new OAuth2Strategy(configOptions(), callbackFn);
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) {
    let httpsProxyAgent = new HttpsProxyAgent(proxy);
    strategy._oauth2.setAgent(httpsProxyAgent);
  }
  return strategy;
};

module.exports = CFStrategy;
