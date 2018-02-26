'use strict';

const passport = require('passport');
const BasicStrategy = require('passport-http').BasicStrategy;

passport.use(new BasicStrategy((username, password, done) => {
  if (username === process.env.BROKER_USER &&
    password === process.env.BROKER_PASSWORD)
    done (null, username);
  else
    done (null, false, {
      message: 'Invalid Credentials'
    });
}));

module.exports = passport.authenticate('basic', { session: false });
