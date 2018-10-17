'use strict';

const httpStatus = require('http-status-codes');

const jsonMediaType = 'json';

const validateJsonMediaType = (req, res, next) => {
  if (!req.is(jsonMediaType)) 
    res.status(httpStatus.UNSUPPORTED_MEDIA_TYPE).send();
  else
    next();
};

module.exports = {
  validateJsonMediaType
};
