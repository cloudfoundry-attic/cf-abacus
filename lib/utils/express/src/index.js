'use strict';

// Convenient setup of Express that uses the most popular and useful Express
// middleware handlers from the Express community.

// We're using process.exit() intentionally here
/* eslint no-process-exit: 1 */

const _ = require('underscore');
const path = require('path');
const fs = require('fs');
const express = require('express');
// const domain = require('domain');
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const morgan = require('morgan');
const responseTime = require('response-time');
const statics = require('serve-static');
const compression = require('compression');
const events = require('abacus-events');
const cp = require('child_process');
const commander = require('commander');
const vcapenv = require('abacus-vcapenv');
const rc = require('abacus-rc');
const oauth = require('abacus-oauth');

const map = _.map;
const keys = _.keys;
const noop = _.noop;
const memoize = _.memoize;
const extend = _.extend;

// Setup debug log
const adebug = require('abacus-debug');
const debug = require('abacus-debug')('abacus-express');
const edebug = require('abacus-debug')('e-abacus-express');

// Load optional dev dependency
/* eslint no-extra-parens: 1 */
const inspector = (() => {
  try {
    return require('express-inspector');
  }
  catch (e) {
    return undefined;
  }
})();

// Set up an event emitter
const emitter = events.emitter('abacus-express/emitter');
const on = (e, l) => {
  emitter.on(e, l);
};

// Return an Express middleware that returns the CORS headers
const cors = () => {
  return (req, res, next) => {
    if(req.headers.origin) {
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Origin', req.headers.origin);
      res.header('Access-Control-Allow-Methods',
        'GET,HEAD,PUT,POST,DELETE,OPTIONS,PATCH');
      res.header('Access-Control-Allow-Headers',
        'Content-Type, Authorization, Content-Length, ' +
        'apiKey, X-Requested-With');
      res.header('Access-Control-Max-Age', '1728000');
    }
    next();
  };
};

// Return an Express middleware that responds to (CORS) OPTIONS requests
const options = () => {
  return (req, res, next) => {
    if(req.method === 'OPTIONS')
      res.status(200).end();
    else
      next();
  };
};

// Accumulate chunks of a request or response body, up to a given length
const accumulate = (accum, length, chunk, encoding) => {
  return chunk && accum.length < length ?
    accum + chunk.toString(encoding ?
    encoding : 'utf8', 0, length - accum.length) : accum;
};

// Truncate a string to a given length and add ... to indicate it
const truncate = (s, length) => {
  return s.length > length ? s.substring(0, length) + '...' : s;
};

// Return true if a mime type identifies text content, recognizes the most
// common text-based mime types
const isText = (mime) => {
  return new RegExp('css|form-data|html|javascript|json|perl|postscript|rdf|' +
    'rtf|sgml|svg|text|urlencoded|xml').test(mime);
};

// Return an Express middleware that logs HTTP request text bodies
const requestLogger = () => {
  if(debug.enabled())
    return (req, res, next) => {
      // Limit log output to 1024 characters
      const max = 1024;

      // Warning: capture is a mutable variable
      let capture = '';

      req.on('data', (chunk) => {
        if(isText(req.get('Content-Type')))
          // Accumulate chunks of the request up to the max number
          // of characters we want to log
          // Warning mutating variable capture
          capture = accumulate(capture, max + 1, chunk, 'utf-8');
      });

      req.on('end', () => {
        // Log the request body
        if(capture.length !== 0)
          debug(
            'Received %s request body\n%s', req.method, truncate(capture, max));
      });

      next();
    };

  return (req, res, next) => {
    next();
  };
};

// Return an Express middleware that logs HTTP response text bodies
const responseLogger = () => {
  if(debug.enabled())
    return (req, res, next) => {
      // Limit log output to 1024 characters
      const max = 1024;

      // Warning: capture is a mutable variable
      let capture = '';

      // Monkey patch res.end and res.write to capture and log the
      // response body string
      const write = res.write;
      res.write = function(chunk, encoding) {
        write.apply(res, arguments);
        if(isText(res.get('Content-Type')))
          // Accumulate chunks of the response up to the max number
          // of characters we want to log
          // Warning mutating variable capture
          capture = accumulate(capture, max + 1, chunk, encoding);
      };

      const end = res.end;
      res.end = function(chunk, encoding) {
        end.apply(res, arguments);
        // Log the response body
        if(capture.length !== 0)
          debug(
            'Sent %s response body\n%s', req.method, truncate(capture, max));
      };

      // Monkey patch res.send to capture the response body as an object
      // before it's stringified to JSON (if it's an object) as that'll
      // give us a cleaner log
      const send = res.send;
      res.send = function() {
        // Handle the various optional argument combinations that can
        // be passed to send
        const body = arguments.length === 2 ?
          typeof arguments[0] !== 'number' && typeof arguments[1] ===
          'number' ? arguments[0] : arguments[1] : arguments[0];
        if(typeof body === 'object') {
          // Restore the original res methods as we're going to log
          // the object right away here, we don't need to capture its
          // JSON representation
          res.write = write;
          res.end = end;
        }

        // Call the original send method
        send.apply(res, arguments);
      };

      next();
    };

  return (req, res, next) => {
    next();
  };
};

// Return configured Express morgan logger middleware
const beforeLogger = () => {
  const morg = morgan(
    ':remote-addr - - :method :url HTTP/:http-version :status ' +
    ':res[content-length] :referrer :user-agent - :response-time ms', {
      immediate: true,
      stream: {
        write: (msg, encoding) => {
          debug('Received request %s', msg.replace(/\n/g, ''));
        }
      }
    });
  return (req, res, next) => {
    return debug.enabled() ? morg(req, res, next) : next();
  };
};

const afterLogger = () => {
  const morg = morgan(
    ':remote-addr - - :method :url HTTP/:http-version :status ' +
    ':res[content-length] :referrer :user-agent - :response-time ms', {
      stream: {
        write: (msg, encoding) => {
          debug('Processed request %s', msg.replace(/\n/g, ''));
        }
      }
    });
  return (req, res, next) => {
    return debug.enabled() ? morg(req, res, next) : next();
  };
};

// Send a redirect header
const sendRedirect = (redirect, res) => {
  if(typeof redirect === 'object')
    if(redirect.status)
      res.redirect(redirect.status, redirect.url);
    else
      res.redirect(redirect.url);
  else
    res.redirect(redirect);
};

// Send the headers found in the given value
const sendHeaders = (value, res) => {
  // Headers
  map(keys(value.header), (k) => res.header(k, value.header[k]));
  if(value.type)
    res.type(value.type);

  // Cookies
  map(keys(value.cookie), (k) => {
    const c = value.cookie[k];
    if(typeof c === 'object')
      if(c.options) res.cookie(k, c.value, c.options);
      else res.cookie(k, c.value);
    else
      res.cookie(k, c);
  });

  // Redirect
  if(value.redirect)
    sendRedirect(value.redirect, res);

  // Location
  if(value.location)
    res.location(value.location);

  // Links
  if(value.links)
    res.links(value.links);
};

// Render and send the template found in the given value
const sendTemplate = (value, res) => {
  // Template local variables
  if(value.locals)
    res.locals = value.locals;
  if(value.props)
    res.props = value.props;

  // Render the template
  res.render(value.template);
};

// Send the body found in the given value
const sendBody = (value, res) => {
  if(value.template)
    sendTemplate(value, res);
  else if(value.body)
    res.send(value.body);
  else if(value.json)
    res.json(value.json);
  else if(value.jsonp)
    res.jsonp(value.jsonp);
  else
    // Default to just send a status code
    res.status(res.statusCode).end();
};

// Return an Express middleware that sends what it finds in res.value
const sendValue = () => {
  return (req, res, next) => {
    if(!res.value) {
      next();
      return;
    }

    // Status code
    res.statusCode = res.value.statusCode || res.value.status || 200;

    // Send the headers found in res.value
    sendHeaders(res.value, res);

    // Send the body found in res.value
    sendBody(res.value, res);

    // The following functions are not yet supported here, instead just
    // call the regular Express response methods if you need
    // res.format(object)
    // res.attachment([filename])
    // res.sendfile(path, [options], [fn]])
    // res.download(path, [filename], [fn])
  };
};

// Return an Express middleware that reports the current process info
const processInfo = () => {
  return (req, res, next) => {
    res.header('X-Process-Id', process.pid);
    res.header('X-Uptime', process.uptime());
    res.header('X-Heap-Used', process.memoryUsage().heapUsed);
    res.header('X-Node-Version', process.version);
    next();
  };
};

// Return an Express middleware for dynamic log config, use like this:
// curl http://localhost:9080/debug?config=disabled or
// curl http://localhost:9080/debug?config=enabled or
// curl http://localhost:9080/debug?config=* or
// curl http://localhost:9080/debug?config=<your log config>
const cdebug = () => {
  const secured = process.env.SECURED === 'true';
  return (req, res, next) => {
    if(req.query.config) {
      if(secured)
        oauth.authorize(req.headers && req.headers.authorization, {
          system: ['abacus.debug.write']
        });
      if(req.query.config === 'disabled')
        adebug.disable();
      else
        adebug.enable(req.query.config);
    }
    res.status(200).send({
      config: process.env.DEBUG
    });
  };
};

// Return an Express middlware that counts concurrent inflight requests
const inflight = () => {
  // Warning: inflight is a mutable variable
  return (req, res, next) => {
    const server = req.client.server ? req.client.server : req.client.socket
      .server;

    // Increment our count of inflight requests when we get a request
    // Warning: mutating variable server.inflight
    server.inflight = server.inflight ? server.inflight + 1 : 1;

    const done = () => {
      // Decrement our count when we're done with the response
      // Warning: mutating variable server.inflight
      server.inflight--;

      // Signal any listeners that the server got quiet
      if(server.inflight === 0)
        server.emit('quiet');
    };
    res.on('finish', done);
    res.on('close', done);
    next();
  };
};

// Return an Express middleware that uses a Node domain to run the middleware
// stack and catch any errors not caught in async callbacks
const catchall = () => {
  return (req, res, next) => {
    // TODO Re-enable this after we understand why unrelated contexts are
    // incorrectly captured by this domain
    /*
    const d = domain.create();
    d.on('error', (err) => {
        debug('Middleware domain error %o', err);

        // Pass the error down the middleware stack.
        next(err);
    });

    // Because req and res were created before this domain existed,
    // we need to explicitly add them.  See the explanation of implicit
    // vs explicit binding in the Node domain docs.
    d.add(req);
    d.add(res);

    // Run the middleware stack in our new domain
    d.run(next);
    */
    next();
  };
};

// Return an Express middleware function used to handle uncaught exceptions
const uncaught = (bailcb) => {

  // Call the given bailout callback after returning a 500 error to the client
  return (err, req, res, next) => {
    edebug('Middleware error %o', err);
    debug('Middleware error %o', err);

    // Report the error to the client
    try {
      debug('Sending error %o', err);
      res.status(err.status || err.statusCode || 500).send(extend({
        message: debug.externalize(err)
      }, typeof err === 'object' ? err : {}));
    }
    catch (exc) {
      edebug('Exception sending error %o', exc);
      debug('Exception sending error %o', exc);
    }

    // Call the bailout callback if the error has a bailout flag
    if(err.bailout && bailcb)
      bailcb(err);
  };
};

// Bailout shutdown
const bailout = (err, server, quiesce) => {
  edebug('Bailing out %o', err);
  debug('Bailing out %o', err);

  // Signal that we're exiting soon
  emitter.emit('message', {
    server: {
      exiting: err
    }
  });

  try {
    // Stop accepting any new requests
    try {
      server.close();
    }
    catch (exc) {
      noop();
    }

    // Quiesce if necessary by letting the server finish processing in-flight
    // requests, but don't wait more than 30 seconds, or exit right away
    const exit = () => {
      process.exit(1);
    };
    if(quiesce) {
      debug('Quiescing %d inflight requests', server.inflight);
      if(server.inflight) {
        server.on('quiet', exit);
        const t = setTimeout(exit, 30000);
        if(t.unref) t.unref();
      }
      else exit();
    }
    else exit();

  }
  catch (exc) {
    // Looks like we're pretty messed up here, exit
    edebug('Exception trying to bail out %o', exc);
    debug('Exception trying to bail out %o', exc);
    process.exit(2);
  }
};

// Return the configured port
const defaultPort = memoize(() => {
  return process.env.PORT ? parseInt(process.env.PORT) : 9080;
});

// Return the configured host
const defaultHost = memoize(() => {
  return process.env.HOST;
});

// Return the configured SSL key
const defaultKey = memoize(() => {
  return process.env.KEY;
});

// Return the configured SSL cert
const defaultCert = memoize(() => {
  return process.env.CERT;
});

// Return the contents of a PEM file
const pem = (file, def) => {
  return file || def ? fs.readFileSync(file || def, 'utf8') : undefined;
};

// Configure the listen options
const lconf = (opt) => {
  if(opt !== undefined)
    debug('Listen options %o', opt);
  return typeof opt === 'object' ? {
    hostname: opt.hostname !== undefined ? opt.hostname : defaultHost(),
    port: opt.port !== undefined ? opt.port : defaultPort(),
    key: pem(opt.key, defaultKey()),
    cert: pem(opt.cert, defaultCert())
  } : {
    hostname: defaultHost(),
    port: opt !== undefined ? opt : defaultPort(),
    key: pem(defaultKey()),
    cert: pem(defaultCert())
  };
};

// An implementation of app.listen() that uses our Express handler middleware,
// and the port configured in the app's environment
const listen = function(opt) {
  const app = this;

  // Configure the listen options
  const conf = lconf(opt);

  // Set the process title
  process.title = 'node ' +
    (process.env.TITLE || [vcapenv.appname(), vcapenv.appindex()].join('-')) +
    ' express';

  app.use(catchall());

  if(!app.basic) {
    // Register some of our middleware after the routes
    app.use(sendValue());
    app.use(options());

    // Register debug config middleware
    if(process.env.SECURED === 'true')
      app.use('/debug',
        oauth.validator(process.env.JWTKEY, process.env.JWTALGO));
    app.use('/debug', cdebug());

    // Serve public static resources under the app public dir as well as this
    // module's public dir
    app.use(statics(path.join(process.cwd(), 'public')));
    app.use(statics(path.join(__dirname, 'public')));
  }

  // Catch 404 errors
  app.use((req, res, next) => {
    res.status(404).send({
      error: 'notfound',
      message: 'Not found'
    });
  });

  // Create an HTTP or HTTPS server
  const server = conf.key && conf.cert ? https.createServer({
    key: conf.key,
    cert: conf.cert
  }, app) : http.createServer(app);

  // Handle middleware errors
  app.use(uncaught((err) => {

    // This will be invoked if the err has a bailout flag
    return bailout(err, server, true);
  }));

  // Listen on the configured port
  server.on('error', (err) => {
    // Signal that we encountered a no-retryable error
    emitter.emit('message', {
      server: {
        noretry: err
      }
    });

    edebug('Server error %o', err);
    debug('Server error %o', err);
    return bailout(err, server, false);
  });

  // Log HTTP ugrades to Web sockets
  server.on('upgrade', (req, socket, head) => {
    debug('Server upgrade request %s', req.url);
  });

  // Listen on the configured port
  server.listen(conf.port, conf.hostname, undefined, () => {
    debug('Server listening on %d', server.address().port);

    // Signal that we're listening
    emitter.emit('message', {
      server: {
        listening: server.address().port
      }
    });
  });

  // Return the server we're using
  return server;
};

// Return an Express app configured with our selection of middleware.
const expressApp = () => {

  // Create the Express app
  const app = express();

  // Use most popular Express middleware and our own as well
  // Handle middleware errors
  app.use(catchall());
  app.use(inflight());
  app.set('trust proxy', true);
  app.use(beforeLogger());
  app.use(requestLogger());
  app.use(afterLogger());
  app.use(compression({
    threshold: 150
  }));
  app.use(responseLogger());
  app.use(methodOverride());
  app.use(bodyParser.json({
    limit: '10mb',
    strict: false
  }));
  app.use(bodyParser.json({
    type: 'application/vnd.api+json',
    limit: '10mb',
    strict: false
  }));
  app.use(bodyParser.urlencoded({
    extended: true,
    limit: '10mb'
  }));
  app.use(responseTime());
  app.use(cors());
  app.use(processInfo());
  if(inspector)
    app.use(inspector());

  // Monkey patch app.listen to plug in our additional behavior
  app.listen = listen;

  return app;
};

// Return an Express app configured with a basic minimum selection of
// middleware.
const basicApp = () => {

  // Create the Express app
  const app = express();

  // Indicate that this is a basic app
  app.basic = true;

  // Use most popular Express middleware and our own as well
  // Handle middleware errors
  app.use(catchall());
  app.use(inflight());
  app.set('trust proxy', true);
  app.use(beforeLogger());
  app.use(afterLogger());

  // Monkey patch app.listen to plug in our additional behavior
  app.listen = listen;

  return app;
};

// Set default port and host name, command line has higher priority then
// the existing env, then rc files
const conf = () => {
  process.env.PORT = commander.port || process.env.PORT || 9080;
  if(commander.host)
    process.env.HOST = commander.host;
};

// Command line interface
const runCLI = () => {
  // Parse command line options
  commander
    .option('-p, --port <port>', 'port number [9080]', '9080')
    .option('-h, --host <hostname>', 'host name [*]')
    .option('start', 'start the server')
    .option('stop', 'stop the server')
    .parse(process.argv);

  // Load env from rc file
  rc();

  // Start a Webapp
  if(commander.start) {
    conf();

    // Run the app CLI
    const app = require(process.cwd());
    if(app && app.runCLI)
      app.runCLI();
  }
  else if(commander.stop)
    // Stop the Webapp
    cp.exec('pkill -f "node ' + vcapenv.appname() + '.* express"',
      (err, stdout, stderr) => {
        if(err) debug('Stop error %o', err);
      });
};

// Export our public functions
module.exports = expressApp;
module.exports.basic = basicApp;
module.exports.on = on;
module.exports.runCLI = runCLI;

