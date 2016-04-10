'use strict';

// A simple Web proxy with a minimalistic round-bobbin load balancing and
// HTTPS support, useful for testing Abacus scaling characteristics without
// having to set up an entire CF environment.

const _ = require('underscore');
const httpProxy = require('http-proxy');
const webapp = require('abacus-webapp');
const url = require('url');
const compression = require('compression');
const cp = require('child_process');
const commander = require('commander');
const rc = require('abacus-rc');

const filter = _.filter;
const map = _.map;
const uniq = _.uniq;

// Setup debug log
const debug = require('abacus-debug')('abacus-webproxy');

// Parse a list of target URLs separated by spaces or commas
const parse = (targets) => {
  return filter(targets.split(/[ ,]/), (s) => s.length != 0);
};

// Create an Express app configured to work as an HTTP proxy
const proxy = (targets) => {

  // Configure the proxy's targets passed as a parameter, from an env
  // variable or default to localhost:9080
  const urls = map(targets ? targets : process.env.TARGETS ?
    parse(process.env.TARGETS) : ['http://localhost:9080'],
    (t) => url.parse(t));
  const paths = uniq(map(urls, (u) => u.path));
  const routes = map(paths, (p) => ({
    path: p,
    targets: map(filter(urls,
      (u) => u.path == p), (u) => u.protocol + '//' + u.host)
  }));
  debug('Proxy routes %o', routes);

  // Create a basic Web app
  const app = webapp.basic();

  // Enable compression
  app.use(compression({ threshold: 150 }));

  // Create an HTTP proxy
  const proxy = httpProxy.createProxyServer({});

  // Proxy HTTP requests
  app.use((req, res, next) => {
    const route = filter(routes,
      (r) => r.path == req.path.substring(0, r.path.length))[0];
    if(!route) {
      debug('No route found for request %s %s', req.method, req.url);
      res.status(404).end();
      return;
    }
    const target = route.target || 0;
    debug('Proxying request %s %s to %s',
      req.method, req.url, route.targets[target]);
    proxy.web(req, res, {
      xfwd: true,
      target: route.targets[target]
    });

    // Round robbin load balancing, cycle through the configured targets
    // Warning: mutating variable route.target, but that's the point here
    route.target = (target + 1) % route.targets.length;
  });

  return app;
};

// Set default port and host name, command line has higher priority then
// the existing env, then rc files
const conf = () => {
  process.env.PORT = commander.port || process.env.PORT || 8080;
  if(commander.host)
    process.env.HOST = commander.host;
};

// Command line interface
const runCLI = () => {
  // Parse command line options
  commander
    .option('-p, --port <port>', 'port number [8080]')
    .option('-h, --host <hostname>', 'host name [*]')
    .option('start', 'start the server')
    .option('stop', 'stop the server')
    .parse(process.argv);

  // Load env from rc file
  rc();

  // Start Web proxy
  if(commander.start) {
    conf();

    // Create Web proxy app and listen on the configured port
    const app = proxy();
    app.listen({
      port: parseInt(process.env.PORT),
      hostname: process.env.HOST
    });

  }
  else if(commander.stop)
    // Stop the Web proxy
    cp.exec('pkill -f "node abacus-webproxy"',
      (err, stdout, stderr) => {
        if(err) debug('Stop error %o', err);
      });
};

// Export our public functions
module.exports = proxy;
module.exports.runCLI = runCLI;

