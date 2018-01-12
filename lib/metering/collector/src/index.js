'use strict';

const router = require('abacus-router');
const webapp = require('abacus-webapp');
const oauth = require('abacus-oauth');
const urienv = require('abacus-urienv');

const debug = require('abacus-debug')('abacus-usage-collector');
const edebug = require('abacus-debug')('e-abacus-usage-collector');

const uris = urienv({
  auth_server: 9882
});

const routes = router();

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

routes.post('/v1/metering/collected/usage', async(request, response) => {
  const usageDoc = request.body;
  debug('Received usage doc %o', usageDoc);

  authorize(request, scope(usageDoc));

  if (!usageDoc || !usageDoc.resource_id)
    return { status: 400 };

  return { status: 500 };
});

const collector = (systemToken) => {
  // Disable cluster module
  process.env.CLUSTER = false;

  const app = webapp();

  if (secured())
    app.use(/^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));
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
