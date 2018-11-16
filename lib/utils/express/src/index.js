'use strict';

// Convenient setup of Express that uses the most popular and useful Express
// middleware handlers from the Express community.

// We're using process.exit() intentionally here
/* eslint no-process-exit: 1 */

const { each, extend, memoize, noop, keys } = require('underscore');

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const morgan = require('morgan');
const responseTime = require('response-time');
const statics = require('serve-static');
const compression = require('compression');
const events = require('abacus-events');
const vcapenv = require('abacus-vcapenv');
const oauth = require('abacus-oauth');
const inflight = require('./lib/middleware/inflight/inflight');
const createRateLimiter = require('./lib/middleware/rate-limiter/mongo-rate-limiter');
const oauthContext = require('./lib/middleware/oauth-context');

// Setup debug log
const adebug = require('abacus-debug');
const debug = require('abacus-debug')('abacus-express');
const edebug = require('abacus-debug')('e-abacus-express');

const maxPayload = process.env.MAX_PAYLOAD || '500kb';

const maxInflight = process.env.MAX_INFLIGHT || 200;
const maxInternalInflight = process.env.MAX_SYSTEM_INFLIGHT || 6;
const systemInflightEnabled = process.env.SYSTEM_INFLIGHT_ENABLED === 'true';
const maxClientInflight = systemInflightEnabled ? maxInflight - maxInternalInflight : maxInflight;

const rateLimitDefinition = process.env.RATE_LIMIT ? JSON.parse(process.env.RATE_LIMIT) : undefined;

const useRateLimiting = () => rateLimitDefinition !== undefined;
const secured = process.env.SECURED === 'true';

const compressResponses = process.env.COMPRESS_RESPONSES === 'true';

if (maxInternalInflight < 0 || maxClientInflight <= 0)
  throw new Error(`Incorrect MAX_INFLIGHT param configuration
   (maxInternalInflight=${maxInternalInflight}, maxClientInflight=${maxClientInflight})`);

// Load optional dev dependency
/* eslint no-extra-parens: 1 */
const inspector = (() => {
  try {
    return require('express-inspector');
  } catch (e) {
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
    if (req.headers.origin) {
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Origin', req.headers.origin);
      res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,POST,DELETE,OPTIONS,PATCH');
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Content-Length, ' + 'apiKey, X-Requested-With'
      );
      res.header('Access-Control-Max-Age', '1728000');
    }
    next();
  };
};

// Accumulate chunks of a request or response body, up to a given length
const accumulate = (accum, length, chunk, encoding) => {
  return chunk && accum.length < length
    ? accum + chunk.toString(encoding ? encoding : 'utf8', 0, length - accum.length)
    : accum;
};

// Truncate a string to a given length and add ... to indicate it
const truncate = (s, length) => {
  return s.length > length ? s.substring(0, length) + '...' : s;
};

// Return true if a mime type identifies text content, recognizes the most
// common text-based mime types
const isText = (mime) => {
  return new RegExp(
    'css|form-data|html|javascript|json|perl|postscript|rdf|' + 'rtf|sgml|svg|text|urlencoded|xml'
  ).test(mime);
};

// Return an Express middleware that logs HTTP request text bodies
const requestLogger = () => {
  if (debug.enabled())
    return (req, res, next) => {
      // Limit log output to 1024 characters
      const max = 1024;

      // Warning: capture is a mutable variable
      let capture = '';

      req.on('data', (chunk) => {
        if (isText(req.get('Content-Type')))
          // Accumulate chunks of the request up to the max number
          // of characters we want to log
          // Warning mutating variable capture
          capture = accumulate(capture, max + 1, chunk, 'utf-8');
      });

      req.on('end', () => {
        // Log the request body
        if (capture.length !== 0) debug('Received %s request body\n%s', req.method, truncate(capture, max));
      });

      next();
    };

  return (req, res, next) => {
    next();
  };
};

// Return an Express middleware that logs HTTP response text bodies
const responseLogger = () => {
  if (debug.enabled())
    return (req, res, next) => {
      // Limit log output to 1024 characters
      const max = 1024;

      let capture = '';

      // Monkey patch res.end and res.write to capture and log the
      // response body string
      const write = res.write;
      res.write = function(chunk, encoding) {
        write.apply(res, arguments);
        if (isText(res.get('Content-Type')))
          // Accumulate chunks of the response up to the max number
          // of characters we want to log
          // Warning mutating variable capture
          capture = accumulate(capture, max + 1, chunk, encoding);
      };

      const end = res.end;
      res.end = function(chunk, encoding) {
        end.apply(res, arguments);
        // Log the response body
        if (capture.length !== 0) debug('Sent %s response body\n%s', req.method, truncate(capture, max));
      };

      // Monkey patch res.send to capture the response body as an object
      // before it's stringified to JSON (if it's an object) as that'll
      // give us a cleaner log
      const send = res.send;
      res.send = function() {
        // Handle the various optional argument combinations that can
        // be passed to send
        const body =
          arguments.length === 2
            ? typeof arguments[0] !== 'number' && typeof arguments[1] === 'number' ? arguments[0] : arguments[1]
            : arguments[0];
        if (typeof body === 'object') {
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
      ':res[content-length] :referrer :user-agent - :response-time ms',
    {
      immediate: true,
      stream: {
        write: (msg, encoding) => {
          debug('Received request %s', msg.replace(/\n/g, ''));
        }
      }
    }
  );
  return (req, res, next) => {
    return debug.enabled() ? morg(req, res, next) : next();
  };
};

const afterLogger = () => {
  const morg = morgan(
    ':remote-addr - - :method :url HTTP/:http-version :status ' +
      ':res[content-length] :referrer :user-agent - :response-time ms',
    {
      stream: {
        write: (msg, encoding) => {
          debug('Processed request %s', msg.replace(/\n/g, ''));
        }
      }
    }
  );
  return (req, res, next) => {
    return debug.enabled() ? morg(req, res, next) : next();
  };
};

// Send a redirect header
const sendRedirect = (redirect, res) => {
  if (typeof redirect === 'object')
    if (redirect.status) res.redirect(redirect.status, redirect.url);
    else res.redirect(redirect.url);
  else res.redirect(redirect);
};

// Send the headers found in the given value
const sendHeaders = (value, res) => {
  // Headers
  each(keys(value.header), (k) => res.header(k, value.header[k]));
  if (value.type) res.type(value.type);

  // Cookies
  each(keys(value.cookie), (k) => {
    const c = value.cookie[k];
    if (typeof c === 'object')
      if (c.options) res.cookie(k, c.value, c.options);
      else res.cookie(k, c.value);
    else res.cookie(k, c);
  });

  // Redirect
  if (value.redirect) sendRedirect(value.redirect, res);

  // Location
  if (value.location) res.location(value.location);

  // Links
  if (value.links) res.links(value.links);
};

// Render and send the template found in the given value
const sendTemplate = (value, res) => {
  // Template local variables
  if (value.locals) res.locals = value.locals;
  if (value.props) res.props = value.props;

  // Render the template
  res.render(value.template);
};

// Send the body found in the given value
const sendBody = (value, res) => {
  if (value.template) sendTemplate(value, res);
  else if (value.body) res.send(value.body);
  else if (value.json) res.json(value.json);
  else if (value.jsonp) res.jsonp(value.jsonp);
  else
    // Default to just send a status code
    res.status(res.statusCode).end();
};

// Return an Express middleware that sends what it finds in res.value
const sendValue = () => {
  return (req, res, next) => {
    if (!res.value) {
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
    if (req.query.config) {
      if (secured)
        oauth.authorize(req.headers && req.headers.authorization, {
          system: ['abacus.debug.write']
        });
      if (req.query.config === 'disabled') adebug.disable();
      else adebug.enable(req.query.config);
    }
    res.status(200).send({
      config: process.env.DEBUG
    });
  };
};

// Return an Express middleware function used to handle uncaught exceptions
// Call the given bailout callback after returning a 500 error to the client
/* eslint complexity: [1, 7] */
const uncaught = (bailcb) => (err, request, response, next) => {
  edebug('Middleware error %o', err);
  debug('Middleware error %o', err);

  try {
    debug('Sending error %o', err);
    response.status(err.status || err.statusCode || 500).send(
      extend(
        { message: debug.externalize(err) },
        typeof err === 'object' ? err : {}
      )
    );
  } catch (exc) {
    edebug('Exception sending error %o', exc);
    debug('Exception sending error %o', exc);
  }

  // Call the bailout callback if the error has a bailout flag
  if (err.bailout && bailcb) bailcb(err);
};

// Bailout shutdown
/* eslint complexity: [1, 7] */
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
    } catch (exc) {
      noop();
    }

    // Quiesce if necessary by letting the server finish processing in-flight
    // requests, but don't wait more than 30 seconds, or exit right away
    const exit = () => {
      process.exit(1);
    };
    if (quiesce) {
      if (server.inflight && server.inflight.total > 0) {
        debug('Quiescing %d inflight requests', server.inflight.total);
        server.on('quiet', exit);
        const t = setTimeout(exit, 30000);
        if (t.unref) t.unref();
      } else exit();
    } else exit();
  } catch (exc) {
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
  if (opt !== undefined)
    debug('Listen options %o', opt);
  return typeof opt === 'object'
    ? {
      hostname: opt.hostname !== undefined ? opt.hostname : defaultHost(),
      port: opt.port !== undefined ? opt.port : defaultPort(),
      key: pem(opt.key, defaultKey()),
      cert: pem(opt.cert, defaultCert())
    }
    : {
      hostname: defaultHost(),
      port: opt !== undefined ? opt : defaultPort(),
      key: pem(defaultKey()),
      cert: pem(defaultCert())
    };
};

const interruptServer = (server) => {
  const message = 'Application interrupted';
  edebug(message);
  return bailout(new Error(message), server, true);
};

const terminateServer = (server) => {
  const message = 'Application terminated';
  edebug(message);
  return bailout(new Error(message), server, true);
};

// An implementation of app.listen() that uses our Express handler middleware,
// and the port configured in the app's environment
const listen = function(opt, cb) {
  const app = this;

  // Configure the listen options
  const conf = lconf(opt);

  // Set the process title
  const vcapAppTitle = [vcapenv.appname(), vcapenv.appindex(), vcapenv.iid()].join('-');
  process.title = `node ${process.env.TITLE || vcapAppTitle} express`;

  // Register some of our middleware after the routes
  app.use(sendValue());

  // Register debug config middleware
  if (process.env.SECURED === 'true') app.use('/debug', oauth.validator(process.env.JWTKEY, process.env.JWTALGO));
  app.use('/debug', cdebug());

  // Serve public static resources under the app public dir as well as this
  // module's public dir
  app.use(statics(path.join(process.cwd(), 'public')));
  app.use(statics(path.join(__dirname, 'public')));

  // Return 404 error
  app.use((req, res, next) => {
    res.status(404).send({
      error: 'notfound',
      message: 'Not found'
    });
  });

  // Create an HTTP or HTTPS server
  const server =
    conf.key && conf.cert
      ? https.createServer(
        {
          key: conf.key,
          cert: conf.cert
        },
        app
      )
      : http.createServer(app);

  // Handle middleware errors
  app.use(
    uncaught((err) => {
      // This will be invoked if the err has a bailout flag
      return bailout(err, server, true);
    })
  );

  // Listen on the configured port
  server.on('error', (err) => {
    // Signal that we encountered non-retryable error
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
  server.listen(conf.port, conf.hostname, undefined, (err) => {
    debug('Server listening on %d', server.address().port);

    // Signal that we're listening
    emitter.emit('message', {
      server: {
        listening: server.address().port
      }
    });

    if (cb) cb(err);
  });

  process.on('SIGINT', () => interruptServer(server));
  process.on('SIGTERM', () => terminateServer(server));

  return server;
};

const registerRateLimiter = (app) => {
  const rateLimiter = createRateLimiter(rateLimitDefinition);
  app.use(rateLimiter);
  process.on('exit', rateLimiter.close);
};

// Return an Express app configured with our selection of middleware.
const expressApp = () => {
  const app = express();

  if (secured)
    app.use(oauthContext(process.env.JWTKEY, process.env.JWTALGO));

  if (useRateLimiting())
    registerRateLimiter(app);

  app.use(inflight(maxClientInflight, maxInternalInflight, secured, systemInflightEnabled));
  app.set('trust proxy', true);
  app.use(beforeLogger());
  app.use(requestLogger());
  app.use(afterLogger());

  if (compressResponses)
    app.use(
      compression({
        threshold: 150
      })
    );

  app.use(responseLogger());
  app.use(methodOverride());
  app.use(
    bodyParser.json({
      limit: maxPayload,
      strict: false
    })
  );
  app.use(
    bodyParser.json({
      type: 'application/vnd.api+json',
      limit: maxPayload,
      strict: false
    })
  );
  app.use(
    bodyParser.urlencoded({
      extended: true,
      limit: maxPayload
    })
  );
  app.use(responseTime());
  app.use(cors());
  app.use(processInfo());

  if (inspector) app.use(inspector());

  // Monkey patch app.listen to plug in our additional behavior
  app.listen = listen;

  return app;
};

// Export our public functions
module.exports = expressApp;
module.exports.on = on;
