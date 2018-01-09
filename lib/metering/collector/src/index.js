'use strict';

const router = require('abacus-router');
const webapp = require('abacus-webapp');
const oauth = require('abacus-oauth');
const urienv = require('abacus-urienv');

// Setup debug log
// const debug = require('abacus-debug')('abacus-usage-collector');
const edebug = require('abacus-debug')('e-abacus-usage-collector');

// Resolve service URIs
const uris = urienv({
  auth_server: 9882
});

// Create an express router
const routes = router();

const scope = (usageDoc) =>
  secured()
    ? {
      resource: [['abacus.usage', usageDoc.resource_id, 'write'].join('.')],
      system: ['abacus.usage.write']
    }
    : undefined;

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;
const authorize = (req, scope) => {
  if (secured())
    oauth.authorize(req && req.headers && req.headers.authorization, scope);
};

const collect = (usageDoc) => {
  return { status: 500 };
};

routes.post('/v1/metering/collected/usage', (req) => {
  const usageDoc = req.body;
  if (!usageDoc || !usageDoc.resource_id)
    return { status: 400 };
  authorize(req, scope(usageDoc));
  return collect(usageDoc);
});

// Create a collector service app
const collector = (systemToken) => {
  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured()) app.use(/^\/batch$/, oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(router.batch(app));
  return app;
};

const startApp = (systemToken) => {
  const app = collector(systemToken);
  app.listen();
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

// Export our public functions
module.exports = collector;
module.exports.runCLI = runCLI;
