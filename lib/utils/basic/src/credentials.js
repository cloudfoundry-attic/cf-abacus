'use strict';

/**
 * abacus-basic/credentials module. 
 * 
 * Exposes functions for extracting credentials off of 
 * basic authentication requests.
 * @module abacus-basic/credentials
 */


const createMalformedAuthenticationError = () => ({
  statusCode: 401,
  header: {
    'WWW-Authenticate': 'Basic realm="cf", error="invalid_token",' +
      ' error_description="malformed"'
  }
});

const basicPrefix = 'Basic ';

/**
 * Extracts basic authentication credentials from the specified
 * express request authorization header.
 * It is valid to have a missing username or missing password,
 * in which case the missing component will contain an empty string.
 * @param {string} header - the authorization header of the request.
 * @throws in case the header is missing or invalid
 */
const fromHeader = (header) => {
  if (!header)
    throw createMalformedAuthenticationError();

  if (!header.startsWith(basicPrefix))
    throw createMalformedAuthenticationError();
  const encodedCredentials = header.substring(basicPrefix.length);

  const decodedCredentials = 
    new Buffer(encodedCredentials, 'base64').toString();
  
  const segments = decodedCredentials.split(':');
  if (segments.length !== 2)
    throw createMalformedAuthenticationError();

  return {
    username: segments[0],
    password: segments[1]
  };
};

/**
 * Extracts basic authentication credentials from the specified
 * express request by checking the authorization header.
 * @see fromHeader
 * @param req - an express request
 * @throws in case the authorization header is missing or invalid
 */
const fromRequest = (req) => {
  return fromHeader(req.headers && req.headers.authorization);
};

module.exports = {
  fromHeader,
  fromRequest
};
