'use strict';

// A simple runner for ES6 scripts.

// This module provides a simple runner setup for ES6 scripts, using the
// popular Babel module to transpile ES6 into ES5 on Node 0.10.x and the
// Harmonize module to enable support for Harmony on Node 0.12.x.

// Implemented in ES5
/* eslint no-var: 0 */

var path = require('path');
var fs = require('fs');
var util = require('util');
var cp = require('child_process');

/* eslint no-process-exit: 1 */
/* eslint no-eval: 1 */
/* jshint evil: true */

// Return true if a file belongs to the current module or a subdirectory of
// that module
var inThisModule = function(file) {
    var rel = path.relative(process.cwd(), file);
    return /^[^\/]*\.js$/.test(rel) || /^[^\/]*\/[^\/]*\.js$/.test(rel);
};

// Return true if a file belongs to a cf-abacus module or in a subdirectory
// of that module
var inAbacusModule = function(file) {
    return inThisModule(file) || /\/cf-abacus-[^\/]*\/[^\/]*\.js$/.test(file) || /\/cf-abacus-[^\/]*\/[^\/]*\/[^\/]*\.js$/.test(file);
};

// An implementation of harmonize that works with Node 0.10, 0.12 and io.js
var harmonize = function() {
    if (typeof Proxy !== 'undefined') return;
    var node = cp.spawn(process.argv[0], ['--harmony', '--harmony-proxies', '--harmony_arrow_functions'].concat(process.argv.slice(1)), { stdio: 'inherit' });
    node.on('close', function(code) { process.exit(code); });
    process.once('uncaughtException', function(e) {});
    throw 'harmony';
};

// Set up a require extension that will transpile ES6 code to ES5 using
// Babel if ES6 is not natively supported
var run = function() {
    // Make sure we're running with --harmony and the harmony features we need
    harmonize();

    try {
        eval('let f = x => x * 2;');
        // ES6 is natively supported, no need to transpile
    }
    catch(e) {
        var babel = require('babel-core');
        require('babel-core/polyfill');

        // Set up the require extension
        // Warning: mutating variable require.extensions
        require.extensions['.js'] = function(module, file) {
            if(inAbacusModule(file)) {
                // Transpile ES6 code in our modules to ES5 using Babel
                process.stdout.write(util.format('Running Babel transforms on %s\n', path.relative(process.cwd(), file)));
                var transpiled = babel.transform(fs.readFileSync(file, 'utf8'), {
                    filename: file, sourceMap: 'both', compact: false, nonStandard: true, auxiliaryComment: 'istanbul ignore next'
                });
                // Compile the resulting source
                module._compile(transpiled.code, file);
            }
            // Outside of our modules just do a regular compile
            else module._compile(fs.readFileSync(file, 'utf8'), file);
        };
    }
};

// Export our public functions
module.exports = run;

