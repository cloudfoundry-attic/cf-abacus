'use strict';

// A wrapper around the popular debug log module, with the ability to
// dynamically enable / disable logging.

const _ = require('underscore');
const util = require('util');
const debug = require('debug');
const events = require('cf-abacus-events');

const extend = _.extend;
const omit = _.omit;
const rest = _.rest;
const toArray = _.toArray;

// Bump up the stack trace limit from the default 10 to 30
// Warning: mutating variable Error
if(Error.stackTraceLimit < 30) Error.stackTraceLimit = 30;

// Convert a value to a value that can be externalized to users
const externalize = (val, user) => {
    if(util.isError(val)) {
        if(val.message) return val.message;
        if(val.code) return val.code;
    }
    else return val;
};

// Truncate a string to a given length and add ... to indicate it
const truncate = (s, length, colors) => {
    return s.length > length ? s.substring(0, length) + (colors ? '\u001b[0m...' : '...') : s;
};

// Convert a string to a single line
const line = (s) => {
    return s.replace(/\n +/g, ' ');
};

// Configure debug with a custom formatter that uses the configured debug log
// colors, an object depth of 10 instead of the default 2, and limits the output
// to 1024 characters
debug.formatters.o = (val) => {
    const colors = debug.formatters.o.useColors && !process.browser;
    const max = 1024;
    if(util.isError(val)) {
        // Inspect an error value
        const err = truncate(line(util.inspect(extend({ message: val.message }, omit(val, 'domain', 'stack')), { colors: colors, depth: 10 })), max, colors);

        // Append the stack, without truncating it to 1024 as we usually want
        // to see the whole stack
        return val.stack ? err + ' - ' + (colors ? '\u001b[31m' + line(val.stack) + '\u001b[0m' : line(val.stack)) : err;
    }

    // Inspect non error values
    return truncate(line(util.inspect(val, { colors: colors, depth: 10 })), max, colors);
};

// Customize the overall debug output format including the date
debug.formatArgs = function formatArgs() {
    if (this.useColors)
        arguments[0] = '  \u001b[3' + this.color + ';1m' + this.namespace + ' ' +
            '\u001b[0m' + arguments[0] + '\u001b[3' + this.color + 'm' + ' +' + debug.humanize(this.diff) + '\u001b[0m';
    else
        arguments[0] = new Date().toISOString() + ' ' + this.namespace + ' ' + arguments[0];
    return arguments;
};

// Log to the console
const clog = function() {
    return console.log.apply(console, arguments);
};

// An emitter for dynamic log enable / disable events
const emitter = events.emitter('cf-abacus-debug/emitter');

const on = (e, l) => {
    return emitter.on(e, l);
};

// Debug log utility, use like this:
// export DEBUG=foo, bar, etc
// const debug = require('debug-log')('foo')
const debuglogger = (namespace) => {

    // Configure our debug log with a logger from the debug module
    // Warning: mutating logger variable
    let logger;
    const config = () => {
        logger = debug(namespace);
        logger.log = logger.enabled ? clog : undefined;
    };
    config();

    // Reconfigure with a new logger on a config event message
    emitter.on('config', (msg) => {
        if(msg.debug && msg.debug.config !== undefined) config();
    });

    const log = function() {
        const format = arguments[0];
        // Prepend the process id to the log
        if(typeof format === 'string')
            return logger.apply(undefined, ['%s ' + format, process.pid ? process.pid : '-'].concat(rest(toArray(arguments))));
        return logger.apply(undefined, ['%s', process.pid ? process.pid : '-'].concat(toArray(arguments)));
    };

    // Return true if this logger's namespace is enabled
    log.enabled = () => {
        return debug.enabled(namespace);
    };

    // Export our externalize utility function
    log.externalize = externalize;

    return log;
};

// Dynamically enable debug log for some namespaces, use like this:
// debug.enable('on') for '*' or debug.enable('your namespaces')
const enable = (namespaces) => {
    // Signal any listeners that we're enabling debug logging
    emitter.emit('message', { debug: { wantEnable: namespaces }});
};

const doEnable = (namespaces) => {

    // Update the env to make future forked processes start with the updated config
    // Warning: mutating variable process.env.DEBUG
    process.env.DEBUG = namespaces === 'enabled' ? '*' : namespaces;

    // Enable debug logging with the new namespaces
    debug.enable(process.env.DEBUG);

    // Signal our loggers that we've reconfigured debug logging
    emitter.emit('config', { debug: { config: namespaces }});
};

// Dynamically disable all debug logs
const disable = () => {
    // Signal any listeners that we're disabling debug logging
    emitter.emit('message', { debug: { wantDisable: '' }});
};

const doDisable = () => {

    // Unset the env to make future forked processes start with logging disabled
    // Warning: mutating variable process.env.DEBUG
    delete process.env.DEBUG;

    // Disable debug logging
    debug.disable();

    // The original debug module doesn't seem to reset these arrays, is that a bug?
    debug.names = [];
    debug.skips = [];

    // Signal our loggers that we've reconfigured debug logging
    emitter.emit('config', { debug: { config: '' }});
};

// Handle debug log enable/disable messages, either sent by ourselves
// or, in a cluster worker for example, received by the cluster master
const onMessage = (msg) => {
    if(msg.debug)
        if(msg.debug.wantEnable !== undefined)
            emitter.emit('message', { debug: { enable: msg.debug.wantEnable }});
        else if(msg.debug.wantDisable !== undefined)
            emitter.emit('message', { debug: { disable: msg.debug.wantDisable }});
        else if(msg.debug.enable !== undefined)
            doEnable(msg.debug.enable);
        else if(msg.debug.disable !== undefined)
            doDisable();
};

// Listen to our own emitter
emitter.on('message', onMessage);

// Return an Express middleware for dynamic log config, use like this:
// curl http://localhost:9080/log?config=disabled or
// curl http://localhost:9080/log?config=enabled or
// curl http://localhost:9080/log?config=* or
// curl http://localhost:9080/log?config=<your log config>
const config = () => {
    return (req, res, next) => {
        if(req.path === '/log') {
            if(req.query.config)
                if(req.query.config === 'disabled')
                    disable();
                else
                    enable(req.query.config);
            res.status(200).send({ config: process.env.DEBUG });
        }
        else next();
    };
};

// Export our public functions
module.exports = debuglogger;
module.exports.externalize = externalize;
module.exports.enable = enable;
module.exports.disable = disable;
module.exports.config = config;
module.exports.onMessage = onMessage;
module.exports.on = on;

