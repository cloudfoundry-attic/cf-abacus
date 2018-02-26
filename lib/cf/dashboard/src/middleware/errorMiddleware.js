'use strict';

/* eslint-disable max-len*/
const _ = require('lodash');
const errors = require('../utils/errors');
const logger = require('../utils/dashboardLogger');
const NotFound = errors.NotFound;

exports.notFound = function() {
  return function(req, res, next) {
    next(new NotFound(`Unable to find any resource matching the requested path '${req.path}'`));
  };
};

// Error handling middleware
exports.error = function(opts) {
  let options = opts || {};
  const properties = ['status', 'message'];
  const env = options.env || process.env.NODE_ENV;
  if (env !== 'production')
    properties.push('stack');

  const formats = ['json', 'text', 'html'];
  const defaultFormat = options.defaultFormat;
  return function(err, req, res, next) {
    logger.error('Unhandled error:', err);
    const body = _.chain(err).pick(properties).defaults({
      status: 500
    }).value();
    const status = body.status;
    res.status(status);
    if (status === 405 && err.allow)
      res.set('allow', err.allow);

    const formatter = {
      text: () => res.send(_
        .chain(body)
        .map((value, key) => `${key}: ${value}`)
        .join('\n')
        .value()
      ),
      html: () => res.render('error',{
        status : body.status,
        message : errors.getErrorMessage(body.status)
      }),
      json: () => res.json(body),
      default: () => res.sendStatus(406)
    };
    logger.info('default format', defaultFormat);
    const defaultFormatter = _.get(formatter, defaultFormat, formatter.default);
    if (_.isEmpty(formats)) 
      return defaultFormatter.call(null);

    return res.format(_
      .chain(formatter)
      .pick(formats)
      .set('default', defaultFormatter)
      .value()
    );
  };
};
