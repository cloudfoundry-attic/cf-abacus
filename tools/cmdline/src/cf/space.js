
'use strict';
/* istanbul ignore file */

const cfCurl = require('./cf-curl');

module.exports = {
  get: (orgGuid, spaceName) => cfCurl.getSingleResult(`/v2/organizations/${orgGuid}/spaces?q=name:${spaceName}`),
  create: (orgGuid, spaceName) => cfCurl.post('/v2/spaces', {
    organization_guid: orgGuid,
    name: spaceName
  })
};
