'use strict';

const _ = require('lodash');
const winston = require('winston'); 

winston.emitErrs = true;

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
  trace: 5,
  silly: 6
};

const colors = {
  trace: 'yellow'
};


const NODE_ENV = process.env.NODE_ENV;
const SHOW_DEBUG_OUTPUT = process.env.SHOW_DEBUG_OUTPUT;

const transports = [
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'debug',
    silent: _.includes(['test'], NODE_ENV) || SHOW_DEBUG_OUTPUT === 'false',
    prettyPrint: true,
    colorize: _.includes(['development', 'test'], NODE_ENV),
    timestamp: _.includes(['development', 'test'], NODE_ENV)
  })
];

const Stream = function(logger) {
  this.logger = logger;
};

Stream.prototype.write = function(message, encoding) {
  /* jshint unused:false */
  this.logger.info(message);
};

const logger = new winston.Logger({
  levels: levels,
  colors: colors,
  transports: transports,
  exitOnError: false
});
logger.stream = new Stream(logger);

module.exports = logger;
