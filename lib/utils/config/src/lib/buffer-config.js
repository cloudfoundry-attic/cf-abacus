'use strict';

module.exports.bufferConfig = (envReader) => ({
  clientId: envReader.readString('CLIENT_ID'),
  clientSecret: envReader.readString('CLIENT_SECRET'),
  secured: envReader.readString('SECURED') === 'true',
  collectQueue: envReader.readString('ABACUS_COLLECT_QUEUE', 'abacus-collect-queue'),
  rabbitUris: envReader.readArray('RABBIT_URI') || ['amqp://localhost:5672'],
  jwtKey: envReader.readString('JWTKEY'),
  jwtAlgo: envReader.readString('JWTALGO')
});
