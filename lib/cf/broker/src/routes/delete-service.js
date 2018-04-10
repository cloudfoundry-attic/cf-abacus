'use strict';

const httpStatus = require('http-status-codes');

module.exports = (req, res) => {
  res.status(httpStatus.OK).send({});
};
