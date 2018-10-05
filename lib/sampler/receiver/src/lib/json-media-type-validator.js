'use strict';

const httpStatus = require('http-status-codes');

const jsonMediaType = 'json';

const validateJsonMediaType = (req, res, next) => {
  if (!req.is(jsonMediaType)) 
    res.send(httpStatus.UNSUPPORTED_MEDIA_TYPE);
  else
    next();
};

module.exports = {
  validateJsonMediaType
};
