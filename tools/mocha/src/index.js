'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

// Test a module using Istanbul and Mocha

// Implemented in ES5 for now
/* eslint no-var: 0 */

if(process.env.LONGJOHN)
  require('longjohn');
var _ = require('underscore');
var path = require('path');
var util = require('util');
var textcov = require('./textcov.js');
var istanbul = require('istanbul');
var fs = require('fs');
var tty = require('tty');
var commander = require('commander');
var childProcess = require('child_process');
var async = require('async');

var contains = _.contains;
var memoize = _.memoize;
var extend = _.extend;

/* eslint no-process-exit: 0 */
/* eslint no-eval: 1 */
/* jshint evil: true */

// Return the directory containing the test target sources
var target = function() {
  try {
    fs.lstatSync('lib');
    return 'lib';
  }
  catch (e) {
    return 'src';
  }
};

// Colorify the report on a tty or when requested on the command line
var colorify = memoize(function(opt) {
  return tty.isatty(process.stdout) || opt.color;
});

// Run Mocha with Istanbul
var runCLI = function() {
  process.stdout.write('Testing...\n');

  // Parse command line options
  if(contains(process.argv, '--command')) {
    commander.istanbul = false;
    commander.color = true;
  }
  else {
    commander
      .option('--no-istanbul', 'do not instrument with Istanbul')
      .option('-i, --istanbul-includes <regex>',
        'instrument matching modules with Istanbul [abacus]', 'abacus')
      .option('--no-color', 'do not colorify output')
      .option('-t, --timeout <number>', 'timeout [60000]', 60000)
      .parse(process.argv);
    if(process.env.NO_ISTANBUL)
      commander.istanbul = false;
  }

  // Time the execution of the tests
  var t0 = Date.now();

  // Collect all test files
  var testDir = path.join(target(), 'test');
  var files = fs.readdirSync(testDir).filter(function(file) {
    return file.substr(-7) === 'test.js';
  });

  // Execute all test files in child processes sequentially
  var collector = new istanbul.Collector();
  var sources = {};
  async.forEachSeries(files, function(file, callback) {
    // Collect child process arguments
    var args = [
      '--file', path.join(testDir, file),
      '--istanbul-includes', commander.istanbulIncludes,
      '--timeout', commander.timeout
    ];
    if(!commander.istanbul)
      args.push('--no-istanbul');
    if(!colorify(commander))
      args.push('--no-color');

    // Spawn child process
    var child = childProcess.fork(__dirname + '/mocha.js', args);

    // Listen for message events from the child process
    child.on('message', function(message) {
      collector.add(message.coverage);
      sources = extend(sources, message.sources);
    });

    // Listen for exit events from the child process
    child.on('exit', function(code) {
      if (code != 0)
        callback(new Error('Child process exited with code ' + code));
      else
        callback();
    });

    // Listen for error events from the child process
    child.on('error', function(err) {
      callback(err);
    });
  }, function(err) {
    // Check for errors
    if(err) {
      process.stderr.write(err.message + '\n');
      process.exit(1);
    }

    // Time the execution of the tests
    var t1 = Date.now();

    // Print the test execution time
    var time = function() {
      process.stdout.write(util.format('\nRun time %dms\n', t1 - t0));
    };

    if(!commander.istanbul) {
      time();
      process.exit(0);
    }

    // Write the JSON and LCOV coverage reports
    var coverage = collector.getFinalCoverage();
    var reporter = new istanbul.Reporter(undefined, '.coverage');
    reporter.addAll(['lcovonly']);
    reporter.write(collector, false, function() {
      fs.writeFileSync('.coverage/coverage.json', JSON.stringify(coverage));

      // Print a detailed source coverage text report and the test
      // execution time
      textcov(coverage, sources, {
        color: colorify(commander)
      });
      time();
    });
  });
};

// Export our public functions
module.exports.runCLI = runCLI;
