'use strict';

const oauth = require('abacus-oauth');
const vcapenv = require('abacus-vcapenv');

module.exports.bufferConfig = (getFromEnv) => ({
  token: (authServerUri) => { 
    return oauth.cache(
      authServerUri,
      getFromEnv('CLIENT_ID'),
      getFromEnv('CLIENT_SECRET'),
      'abacus.usage.read abacus.usage.write'); 
  },
  clientId: getFromEnv('CLIENT_ID'),
  clientSecret: getFromEnv('CLIENT_SECRET'),
  secured: getFromEnv('SECURED') === 'true',
  collectQueue: getFromEnv('ABACUS_COLLECT_QUEUE') || 'abacus-collect-queue',
  rabbitUris: getFromEnv('RABBIT_URI') ?
    [getFromEnv('RABBIT_URI')] :
    vcapenv.serviceInstancesCredentials(getFromEnv('RABBIT_SERVICE_NAME'), 'uris'),
  jwtKey: getFromEnv('JWTKEY'),
  jwtAlgo: getFromEnv('JWTALGO')
});
