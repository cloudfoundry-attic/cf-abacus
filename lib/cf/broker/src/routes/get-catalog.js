'use strict';

const httpStatus = require('http-status-codes');

const catalog = require('../catalog/catalog.js');

module.exports = (req, res) => {
  res.status(httpStatus.OK).send(catalog);
};

