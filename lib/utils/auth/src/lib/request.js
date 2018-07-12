'use strict';

/**
 * Returns the authorization component for the given HTTP request. If the
 * specified request does not have a valid authorization header or an
 * authorization header altogether, then this function returns null.
 * 
 * Following is an example of an authorization object that can be returned
 * by this function.
 * 
 *  {
 *    type: 'basic',
 *    credentials: 'YWJhY3VzOnRvcC1zZWNyZXQ='
 *  }
 * 
 * @param {object} req the HTTP request object
 * @returns {object} the parsed authorization object or null if one
 * cannot be extracted
 */
const getAuthorization = (req) => {
  const authHeader = req.headers && req.headers.authorization;
  if (!authHeader)
    return null;

  const segments = authHeader.split(' ', 2);
  if (segments.length < 2)
    return null;

  return {
    type: segments[0].toLowerCase(),
    credentials: segments[1]
  };
};

/**
 * Checks whether the specified request has a valid authorization request.
 * @param {object} req the HTTP request object
 * @returns {boolean} true if the request has a valid authorization header,
 * false otherwise
 */
const hasAuthorization = (req) => {
  const auth = getAuthorization(req);
  return !!auth;
};

module.exports = {
  hasAuthorization,
  getAuthorization
};
