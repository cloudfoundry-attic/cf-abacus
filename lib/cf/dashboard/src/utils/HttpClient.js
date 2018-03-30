/* eslint-disable complexity*/
'use strict';

const Promise = require('bluebird');
const request = require('request');
const _ = require('lodash');
const errors = require('../utils/errors');
const logger = require('../utils/dashboardLogger');
const NotFound = errors.NotFound;
const BadRequest = errors.BadRequest;
const InternalServerError = errors.InternalServerError;
const Forbidden = errors.Forbidden;
const Unauthorized = errors.Unauthorized;
const Conflict = errors.Conflict;

class HttpClient {
  constructor(options) {
    this.defaultRequest = Promise.promisify(request.defaults(options), {
      multiArgs: true
    });
  }

  request(options) {
    let msg = `${options.method} ${options.url}`;
    logger.debug('Sending HTTP request:', msg);
    return this.defaultRequest(options).spread((res, body) => {
      const result = {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        headers: res.headers,
        body: body
      };
      if (res.statusCode >= 400) {
        let message = res.statusMessage;
        let err;
        switch (res.statusCode) {
          case 400:
            logger.warn(message, {
              request: msg,
              response: result
            });
            err = new BadRequest(message);
            break;
          case 401:
            logger.error(message, {
              request: msg,
              response: result
            });
            err = new Unauthorized(message);
            break;
          case 404:
            logger.error(message);
            err = new NotFound(message);
            break;
          case 403:
            logger.warn(message, {
              request: msg,
              response: result
            });
            err = new Forbidden(message);
            break;
          case 409:
            logger.error(message, {
              request: msg,
              response: result
            });
            err = new Conflict(message);
            break;
          default:
            logger.error(message, {
              request: msg,
              response: result
            });
            err = new InternalServerError(message);
            break;
        }
        if (body && typeof _.isObject(body)) 
          err.error = body;
        
        throw err;
      }
      return result;
    });
  }
}

module.exports = HttpClient;
