'use strict';

const router = require('abacus-router');
const webapp = require('abacus-webapp');
const oauth = require('abacus-oauth');
const urienv = require('abacus-urienv');
const validator = require('./lib/usage-validator.js');
const rabbit = require('abacus-rabbitmq');

const debug = require('abacus-debug')('abacus-usage-collector');
const edebug = require('abacus-debug')('e-abacus-usage-collector');

const uris = urienv({
  auth_server: 9882
});
const queueName = 'abacus-collect-queue';

const routes = router();
let producer;

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

const connectToRabbit = () => {
  const rabbitUri = process.env.RABBIT_URI ? process.env.RABBIT_URI : process.env.VCAP_SERVICES.rabbitmq[0].uri;
  const connManager = new rabbit.ConnectionManager([rabbitUri], queueName);
  producer = new rabbit.Producer(connManager, queueName);
};

const enqueue = async(usageDoc) => {
  await producer.send(usageDoc);
};

const getDocumentLocation = (usageDoc) => {
  // TODO: generate correct location
  return 'https://metering';
};

const collect = async(usageDoc, auth) => {
  try {
    await validator.validate(usageDoc, auth);
  } catch(error) {
    edebug('Usage document validation failed %j', error);
    const statusCode = error.badRequest === true ? 400 : 500;
    return { status: statusCode, body: error.err };
  }
  try {
    await enqueue(usageDoc);
  } catch(error) {
    edebug('Usage document enqueue failed %j', error);
    return { status: 500, body: error };
  }
  return {
    status: 201,
    header: {
      Location: getDocumentLocation(usageDoc)
    }
  };
};

routes.post('/v1/metering/collected/usage', async(request, response) => {
  const usageDoc = request.body;
  debug('Received usage doc %o', usageDoc);

  authorize(request, scope(usageDoc));

  if (!usageDoc || !usageDoc.resource_id)
    return { status: 400 };

  return await collect(usageDoc, request.headers.authorization);
});

const collector = (systemToken) => {
  // Disable cluster module
  process.env.CLUSTER = false;

  const app = webapp();

  if (secured())
    app.use(/^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));
  connectToRabbit();
  return app;
};

const startApp = (systemToken, cb) => {
  const app = collector(systemToken);
  return app.listen();
};

const runCLI = () => {
  if (secured()) {
    const systemToken = oauth.cache(
      uris.auth_server,
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      'abacus.usage.write abacus.usage.read'
    );

    systemToken.start((err) => {
      if (err) edebug('Unable to obtain oAuth token due to %o', err);
      else startApp(systemToken);
    });
  } else startApp();
};

module.exports = startApp;
module.exports.runCLI = runCLI;
