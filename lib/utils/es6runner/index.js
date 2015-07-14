'use strict';

// A simple runner for ES6 scripts.
// This module provides a simple runner setup for ES6 scripts, using the
// popular Babel module to transpile ES6 into ES5 on Node 0.10.x and the
// Harmonize module to enable support for Harmony on Node 0.12.x.

var path = require('path');
var fs = require('fs');
var util = require('util');
var harmonize = require('harmonize');

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

// Set up a require extension that will transpile ES6 code to ES5 using
// Babel if ES6 is not natively supported
var run = function() {

    // Make sure we're running with Harmony enabled
    harmonize();

    try {
        /* eslint no-eval: 1 */
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

