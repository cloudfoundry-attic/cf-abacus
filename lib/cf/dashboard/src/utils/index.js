'use strict';

const logger = require('./dashboardLogger');
const routes = require('../routes');
const middleware = require('../middleware/errorMiddleware');
const errors = require('./errors');
const urlParser = require('../utils').urlParser;


exports.logger = logger;
exports.routes = routes;
exports.middleware = middleware;
exports.errors = errors;
exports.urlParser = urlParser;
