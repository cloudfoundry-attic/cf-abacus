'use strict';

const vcapenv = require('abacus-vcapenv');

module.exports.bufferConfig = (getFromEnv) => ({
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
