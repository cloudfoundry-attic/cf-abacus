'use strict';

// Run a build command on a selection of modules

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var util = require('util');
var cp = require('child_process');
var os = require('os');

var map = _.map;
var filter = _.filter;
var rest = _.rest;
var initial = _.initial;
var last = _.last;

/* eslint no-process-exit: 1 */

// The directories containing the modules to build
var builddirs = ['node_modules'];

// The env of the build commands
var buildenv = _.extend(process.env, { TERM: 'color', DEBUG_COLORS: 'true', COVERAGE_COLORS: 'true', FORCE_COLOR: 'true', MOCHA_COLORS: 'true' });

// Throttle the execution of a function
var throttle = function(fn, max) {
    var running = 0;
    var queue = [];

    var run = function(callargs) {
        if(running === max) return queue.push(callargs);

        running = running + 1;
        var cb = last(callargs);
        return fn.apply(null, initial(callargs).concat([function(err, val) {
            cb(err, val);

            running = running - 1;
            if(queue.length) {
                var next = queue.shift();
                process.nextTick(function() { run(next); });
            }
        }]));
    };

    return function() { return run(arguments); };
};

// Execute a command in a given module directory. We throttle this function to
// limit the number of concurrent commands to a reasonable number.
var exec = throttle(function(cmd, cwd, cb) {
    process.stdout.write(util.format('> %s: %s\n', cwd, cmd));
    var ex = cp.exec(cmd, { cwd: cwd, env: buildenv });
    ex.data = [];
    ex.stdout.on('data', function(data) {
        ex.data.push({ s: process.stdout, data: data });
    });
    ex.stderr.on('data', function(data) {
        ex.data.push({ s: process.stderr, data: data });
    });
    ex.on('close', function(code) {
        process.stdout.write(util.format('< %s: %s\n', cwd, cmd));
        _.map(ex.data, function(d) { d.s.write(d.data); });
        process.stdout.write('\n');

        // Call back when done
        cb(code !== 0 ? code : undefined, true);
    });
}, process.env.THROTTLE ? parseInt(process.env.THROTTLE) : os.cpus().length);

// Execute a build command for each Abacus module
var runCLI = function() {
    // Use the given regular expression to filter modules
    var rx = new RegExp(process.argv[2]);

    // Look for modules in the configured build directories
    map(builddirs, function(dir) {
        fs.readdir(dir, function(err, files) {
            if(err) return;
            map(filter(filter(filter(map(files, function(file) {
                return path.join(dir, file);
            }), function(file) {
                return fs.lstatSync(file).isDirectory();
            }), function(subdir) {
                return fs.existsSync(path.join(subdir, 'package.json'));
            }), function(subdir) {
                return rx.test(require(path.join(process.cwd(), path.join(subdir, 'package.json'))).name);
            }), function(file) {
                // Run the given command on each module
                exec(rest(process.argv, 3).join(' '), file, function(err, val) {
                    if(err) process.exit(err);
                });
            });
        });
    });
};

// Export our CLI
module.exports.runCLI = runCLI;

