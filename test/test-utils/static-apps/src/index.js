'use-strict';

const request = require('abacus-request');

const resourcesLocation = `${__dirname}/../resources`;

const testAppManifestLocation = () => `${resourcesLocation}/test-app/manifest.yml`;

const testMappingAppManifestLocation = () => `${resourcesLocation}/test-mapping-app/manifest.yml`;

const testAppClient = (url) => {
  const getCredentials = (cb) => request.get(`${url}/credentials`, (err, response) => {
    if (err)
      return cb(err);

    return cb(undefined, response.body);
  });

  const postUsage = (usageBody, cb) => request.post(`${url}/usage`, {
    body: usageBody
  }, cb);

  return {
    getCredentials,
    postUsage
  };
};

module.exports = {
  testAppClient: testAppClient,
  testAppManifestLocation: testAppManifestLocation,
  testMappingAppManifestLocation: testMappingAppManifestLocation
};
