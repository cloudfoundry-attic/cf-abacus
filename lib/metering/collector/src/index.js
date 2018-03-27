'use strict';

const router = require('abacus-router');
const webapp = require('abacus-webapp');
const oauth = require('abacus-oauth');
const { ConnectionManager, Producer } = require('abacus-rabbitmq');

const validator = require('./lib/usage-validator');
const Collector = require('./lib/collector');

const HttpStatus = require('http-status-codes');

const debug = require('abacus-debug')('abacus-usage-collector');

const queueName = process.env.ABACUS_COLLECT_QUEUE || 'abacus-collect-queue';

const routes = router();
let collector;

const secured = () => process.env.SECURED === 'true';

const scope = (usageDoc) =>
  secured()
    ? {
      resource: [['abacus.usage', usageDoc.resource_id, 'write'].join('.')],
      system: ['abacus.usage.write']
    }
    : undefined;

const authorize = (req, scope) => {
  if (secured())
    oauth.authorize(req && req.headers && req.headers.authorization, scope);
};

const createProducer = async() => {
  const rabbitUri = process.env.RABBIT_URI ? process.env.RABBIT_URI : process.env.VCAP_SERVICES.rabbitmq[0].uri;
  const connManager = new ConnectionManager([rabbitUri]);
  const producer = new Producer(connManager, queueName);
  await producer.connect();
  return producer;
};

routes.post('/v1/metering/collected/usage', async(request, response) => {
  const usageDoc = request.body;
  debug('Received usage doc %o', usageDoc);

  authorize(request, scope(usageDoc));

  if (!usageDoc || !usageDoc.resource_id)
    return { status: HttpStatus.BAD_REQUEST };

  return await collector.collect(usageDoc, request.headers.authorization);
});

const startApp = async() => {
  process.env.CLUSTER = false;

  const app = webapp();

  if (secured())
    app.use(/^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));
  debug('Creating producer..');
  const producer = await createProducer();
  debug('Producer created: %o', producer);
  collector = new Collector(validator, producer);

  return app.listen();
};

const runCLI = async() => await startApp();

module.exports = startApp;
module.exports.runCLI = runCLI;
