'use strict';

// Usage collector service, responsible for receiving usage data batches
// submitted by service providers and storing them in the usage db.
const util = require('util');

const oauth = require('abacus-oauth');
const router = require('abacus-router');
const urienv = require('abacus-urienv');
const vcapenv = require('abacus-vcapenv');
const webapp = require('abacus-webapp');
const { ConnectionManager, Producer } = require('abacus-rabbitmq');

const validator = require('./lib/usage-validator');
const Collector = require('./lib/collector');

const HttpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-usage-collector');

const queueName = process.env.ABACUS_COLLECT_QUEUE || 'abacus-collect-queue';

const routes = router();

const secured = () => process.env.SECURED === 'true';

const uris = urienv({
  auth_server: 9882
});

const authorize = (req, usageDoc) => {
  if (!secured())
    return;

  oauth.authorize(req && req.headers && req.headers.authorization, {
    resource: [['abacus.usage', usageDoc.resource_id, 'write'].join('.')],
    system: ['abacus.usage.write']
  });
};

const createProducer = async() => {
  const rabbitUris = process.env.RABBIT_URI ?
    [process.env.RABBIT_URI] :
    vcapenv.serviceInstancesCredentials(process.env.RABBIT_INSTANCE_NAME, 'uris');
  const connManager = new ConnectionManager(rabbitUris[0]);
  const producer = new Producer(connManager, queueName);
  await producer.connect();
  return producer;
};


const startApp = async() => {
  const app = webapp();
  let token;
  if (!secured())
    token = () => {};
  else {
    app.use(/^\/v1\/metering|^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));
    token = oauth.cache(
      uris.auth_server,
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      'abacus.usage.write abacus.usage.read'
    );
    await util.promisify(token.start)();
  }

  debug('Creating producer..');
  const producer = await createProducer();
  const collector = new Collector(validator, producer);

  routes.post('/v1/metering/collected/usage', async(request, response) => {
    const usageDoc = request.body;
    debug('Received usage doc %o', usageDoc);

    authorize(request, usageDoc);

    if (!usageDoc || !usageDoc.resource_id)
      return { status: HttpStatus.BAD_REQUEST };

    return await collector.collect(usageDoc, token());
  });

  app.use(routes);
  app.use(router.batch(app));

  return app.listen();
};

const runCLI = async() => await startApp();

module.exports = startApp;
module.exports.runCLI = runCLI;
