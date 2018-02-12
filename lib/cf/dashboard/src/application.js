'use strict';
/* eslint-disable max-len*/
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const passport = require('passport');
const lib = require('./utils');
const routes = lib.routes;
const middleware = lib.middleware;
const config = require('./config');
const port = process.env.PORT || 5000;
const authenticator = require('./middleware/authMiddleware');
const controller = require('./controllers').cfApi;
const authCtrl = require('./auth');
const debug = require('abacus-debug')('abacus-dashboard');
const webapp = require('abacus-webapp');
const expressSession = require('express-session');
const dbController = require('./db').dbController;
const helmet = require('helmet');

const createApp = function() {
  const app = webapp();
  app.use(helmet({
    frameguard: {
      action: 'deny'
    }
  }));
  app.use(helmet.contentSecurityPolicy({
    directives : {
      defaultSrc : ['\'self\'' ],
      scriptSrc : [ '\'self\''],
      styleSrc : [ '\'self\'', '\'unsafe-inline\''],
      imgSrc : ['\'self\'' , 'data: *'],
      childSrc : ['\'self\'' ,'blob: *']
    },
    reportOnly: false,
    setAllHeaders: true,
    disableAndroid: true,
    browserSniff: false
  }));
  app.use(helmet.noCache());
  app.set('case sensitive routing', true);
  app.set('env', process.env.NODE_ENV || 'development');
  app.set('port', port);
  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json());
  app.use(express.static(__dirname + '/webapp'));
  app.use(expressSession({
    saveUninitialized: false,
    resave: false,
    rolling: true,
    secret: config.cf.cookie_secret,
    cookie: {
      secure: 'auto',
      maxAge: 15 * 60 * 1000
    },
    store: dbController.getSessionStore()
  }));

  app.enable('trust proxy');
  app.use(passport.initialize());
  app.use(passport.session());

  controller.getInfo().then((result) => {
    let response = result.body;
    config.cf.authorize_url = `${response.authorization_endpoint}/oauth/authorize`;
    config.cf.token_url = `${response.token_endpoint}/oauth/token`;
    debug('passport strategy called');
    let strategy = authCtrl.passportStrategy();
    passport.use(strategy);
  });
  app.set('views', path.join(__dirname, 'webapp/views'));
  app.set('view engine', 'pug');
  app.use('/v1', routes.cfAbacus);
  app.use('/manage/instances', routes.ui);
  app.use('/userProfile',routes.userProfile);
  // protect non-functional routes also
  app.use('/*', authenticator.ensureAuthenticated);
  app.use(middleware.notFound());
  // error handler
  app.use(middleware.error({
    formats: [
      'json',
      'text',
      'html'
    ]
  }));
  return app;
};
;
module.exports = createApp;
