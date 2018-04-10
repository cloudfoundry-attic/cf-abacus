'use strict';

const jwt = require('jsonwebtoken');

const tokenSecret = 'secret';
const systemWriteTokenPayload = {
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-provisioning-plugin',
  authorities: [
    'abacus.usage.write'
  ],
  scope: [
    'abacus.usage.write'
  ],
  client_id: 'abacus-provisioning-plugin',
  cid: 'abacus-provisioning-plugin',
  azp: 'abacus-provisioning-plugin',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-provisioning-plugin',
    'abacus.usage'
  ]
};

const systemReadTokenPayload = {
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-provisioning-plugin',
  authorities: [
    'abacus.usage.read'
  ],
  scope: [
    'abacus.usage.read'
  ],
  client_id: 'abacus-provisioning-plugin',
  cid: 'abacus-provisioning-plugin',
  azp: 'abacus-provisioning-plugin',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-provisioning-plugin',
    'abacus.usage'
  ]
};

const systemTokenPayload = {
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-provisioning-plugin',
  authorities: [
    'abacus.usage.read',
    'abacus.usage.write'
  ],
  scope: [
    'abacus.usage.read',
    'abacus.usage.write'
  ],
  client_id: 'abacus-provisioning-plugin',
  cid: 'abacus-provisioning-plugin',
  azp: 'abacus-provisioning-plugin',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-provisioning-plugin',
    'abacus.usage'
  ]
};

const resourceWriteTokenPayload = (resourceId) => ({
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-provisioning-plugin',
  authorities: [
    `abacus.usage.${resourceId}.write`
  ],
  scope: [
    `abacus.usage.${resourceId}.write`
  ],
  client_id: 'abacus-provisioning-plugin',
  cid: 'abacus-provisioning-plugin',
  azp: 'abacus-provisioning-plugin',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-provisioning-plugin',
    'abacus.usage'
  ]
});

const resourceReadTokenPayload = (resourceId) => ({
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-provisioning-plugin',
  authorities: [
    `abacus.usage.${resourceId}.read`
  ],
  scope: [
    `abacus.usage.${resourceId}.read`
  ],
  client_id: 'abacus-provisioning-plugin',
  cid: 'abacus-provisioning-plugin',
  azp: 'abacus-provisioning-plugin',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-provisioning-plugin',
    'abacus.usage'
  ]
});

const resourceTokenPayload = (resourceId) => ({
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-provisioning-plugin',
  authorities: [
    `abacus.usage.${resourceId}.read`,
    `abacus.usage.${resourceId}.write`
  ],
  scope: [
    `abacus.usage.${resourceId}.read`,
    `abacus.usage.${resourceId}.write`
  ],
  client_id: 'abacus-provisioning-plugin',
  cid: 'abacus-provisioning-plugin',
  azp: 'abacus-provisioning-plugin',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-provisioning-plugin',
    'abacus.usage'
  ]
});

const sign = (payload, secret) => {
  return jwt.sign(payload, secret, { expiresIn: 43200 });
};

const getBearerToken = (signedToken) => {
  return 'bearer ' + signedToken;
};

const authorization = (payload) => ({
  authorization: getBearerToken(sign(payload, tokenSecret))
});

const getSystemReadAuthorization = () => {
  return authorization(systemReadTokenPayload);
};

const getSystemWriteAuthorization = () => {
  return authorization(systemWriteTokenPayload);
};

const getSystemAuthorization = () => {
  return authorization(systemTokenPayload);
};

const getResourceReadAuthorization = (resourceId) => {
  return authorization(resourceReadTokenPayload(resourceId));
};

const getResourceWriteAuthorization = (resourceId) => {
  return authorization(resourceWriteTokenPayload(resourceId));
};

const getResourceAuthorization = (resourceId) => {
  return authorization(resourceTokenPayload(resourceId));
};

module.exports.TOKEN_SECRET = tokenSecret;
module.exports.getSystemReadAuthorization = getSystemReadAuthorization;
module.exports.getSystemWriteAuthorization = getSystemWriteAuthorization;
module.exports.getSystemAuthorization = getSystemAuthorization;
module.exports.getResourceReadAuthorization = getResourceReadAuthorization;
module.exports.getResourceWriteAuthorization = getResourceWriteAuthorization;
module.exports.getResourceAuthorization = getResourceAuthorization;
