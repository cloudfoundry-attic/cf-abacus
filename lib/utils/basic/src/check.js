'use strict';

/**
 * abacus-basic/check module. 
 * 
 * Exposes functions for checking basic authentication
 * related aspects
 * @module abacus-basic/check
 */


/**
 * Returns whether the header represents a basic authentication one.
 * @param {string} header - the authorization header of the request.
 * @returns true if a basic authentication header, false otherwise
 */
const isBasicHeader = (header) => {
  return /^basic /i.test(header);
};

/**
 * Returns whether the request contains a basic authentication header.
 * @see isBasicHeader
 * @param req - an express request
 * @returns true if a basic authentication request, false otherwise
 */
const isBasicRequest = (req) => {
  return isBasicHeader(req.headers && req.headers.authorization);
};

module.exports = {
  isBasicHeader,
  isBasicRequest
};
