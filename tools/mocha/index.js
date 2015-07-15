'use strict';

// Test a module using Babel, Istanbul and Mocha

var _ = require('underscore');
var path = require('path');
var util = require('util');
var smap = require('source-map');
var textcov = require('./textcov.js');
var istanbul = require('istanbul-harmony');
var Mocha = require('mocha');
var cp = require('child_process');

// Return true if a file belongs to the current module or a subdirectory of
// that module
var inThisModule = function(file) {
    var rel = path.relative(process.cwd(), file);
    return /^[^\/]*\.js$/.test(rel) || /^[^\/]*\/[^\/]*\.js$/.test(rel);
};

// Return true if a file is a test
var inTestDir = function(file) {
    var rel = path.relative(process.cwd(), file);
    return /^test\//.test(rel);
};

// Return true if a file belongs to a cf-abacus module or a subdirectory
// of that module
var inAbacusModule = function(file) {
    return inThisModule(file) || /\/cf-abacus-[^\/]*\/[^\/]*\.js$/.test(file) || /\/cf-abacus-[^\/]*\/[^\/]*\/[^\/]*\.js$/.test(file);
};

// Return a transform function that transforms a file and records the original
// source and a source map in the given sets
var transformer = function(sources, maps) {
    // Set up a transpile function that will transpile ES6 code to ES5 using
    // Babel if ES6 is not natively supported
    var transpile = (function() {
        try {
            /* eslint no-eval: 1 */
            eval('let f = x => x * 2;');
            // ES6 is natively supported, no need to transpile
            return function(code, file) {
                sources[file] = code;
                return code;
            };
        }
        catch(e) {
            console.log(e);
            // Transpile ES6 code to ES5
            var babel = require('babel-core');
            require('babel-core/polyfill');

            return function(code, file) {
                process.stdout.write(util.format('Running Babel transforms on %s\n', path.relative(process.cwd(), file)));
                var transpiled = babel.transform(code, {
                    filename: file, sourceMap: 'both', compact: false, nonStandard: true, auxiliaryComment: 'istanbul ignore next'
                });

                // Record the original source and transsform source map
                sources[file] = code;
                maps[file] = new smap.SourceMapConsumer(transpiled.map);
                return transpiled.code;
            };
        }
    })();

    // Set up an instrument function that will instrument the relevant code
    var instrumenter = new istanbul.Instrumenter({ coverageVariable: '__coverage', preserveComments: true });
    var noinstrument = process.env.NO_ISTANBUL;
    var instrument = function(code, file) {
        if(noinstrument === undefined && inThisModule(file) && !inTestDir(file)) {
            process.stdout.write(util.format('Running Istanbul instrumentation on %s\n', path.relative(process.cwd(), file)));
            return instrumenter.instrumentSync(code, file);
        }
        return code;
    };

    // Return the configured transform function
    return function(code, file) {
        return instrument(transpile(code, file), file);
    };
};

// Remap Istanbul statement, function and branch coverage maps to the original
// source code using the given set of source maps
var remap = function(coverage, maps) {
    _.map(_.values(coverage), function(cov) {
        var map = maps[cov.path];
        if(!map) return;

        var reloc = function(l) {
            var start = map.originalPositionFor(l.start);
            if(start.line !== null) l.start = start;
            var end = map.originalPositionFor(l.end);
            if(end.line !== null) l.end = end;
        };

        _.map(_.values(cov.statementMap), function(s) { reloc(s); });
        _.map(_.values(cov.fnMap), function(f) {
            reloc(f.loc);
            f.line = f.loc.start.line;
        });
        _.map(_.values(cov.branchMap), function(b) {
            _.map(b.locations, function(l) { reloc(l); });
            b.line = b.locations[0].start.line;
        });
    });
    return coverage;
};

// An implementation of harmonize that works with Node 0.10, 0.12 and io.js
var harmonize = function() {
    if (typeof Proxy !== 'undefined') return;
    var node = cp.spawn(process.argv[0], ['--harmony', '--harmony-proxies', '--harmony_arrow_functions'].concat(process.argv.slice(1)), { stdio: 'inherit' });
    node.on('close', function(code) { process.exit(code); });
    process.once('uncaughtException', function(e) {});
    throw 'harmony';
};

// Run Mocha with Babel and Istanbul
var runCLI = function() {
    // Make sure we run with --harmony and the harmony features we need
    harmonize();

    process.stdout.write('Testing...\n');
    var t0 = new Date();

    // Declare test to Mocha
    var mocha = new Mocha(process.env.MOCHA_COLORS ? { useColors: true, timeout: 20000 } : {});
    mocha.addFile('test/test.js');

    // Install Chai expect and Sinon spy and stub as globals
    global.chai = require('chai');
    global.expect = global.chai.expect;
    global.sinon = require('sinon');
    global.spy = global.sinon.spy;
    global.stub = global.sinon.stub;

    // Install an Istanbul require transform hook that transpiles relevant
    // files to ES5 using Babel then instruments them for coverage
    var sources = [];
    var maps = [];
    istanbul.hook.hookRequire(inAbacusModule, transformer(sources, maps));

    // Run the test with Mocha
    mocha.run(function(failures) {
        // Remap the generated source coverage maps using the collected source
        // maps
        remap(global.__coverage, maps);

        // Print a detailed source coverage text report
        textcov(global.__coverage, sources);

        // Print the test execution time
        process.stdout.write(util.format('\nRun time %dms\n', Date.now() - t0));

        /* eslint no-process-exit: 1 */
        process.exit(failures);
    });
};

// Export our public functions
module.exports.runCLI = runCLI;

