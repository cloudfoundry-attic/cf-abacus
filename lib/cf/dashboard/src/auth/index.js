'use strict';

const authController = require('./AuthenticationController');

exports.authConfigCtrl = new authController();
exports.passportStrategy = require('./authentication');
