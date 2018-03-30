'use strict';
/* istanbul ignore file */

const cfCurl = require('./cf-curl');

module.exports = {
  get: (orgName) => cfCurl.getSingleResult(`/v2/organizations?q=name:${orgName}`),
  create: (orgName) => cfCurl.post('/v2/organizations', { name: orgName }),
  delete: (orgGuid) => cfCurl.delete(`/v2/organizations/${orgGuid}?recursive=true`)
};
