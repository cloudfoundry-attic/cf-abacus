'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

// Test a module using Istanbul and Mocha

// Implemented in ES5 for now
/* eslint no-var: 0 */

if(process.env.LONGJOHN)
  require('longjohn');
const _ = require('underscore');
const path = require('path');
const util = require('util');
const textcov = require('./textcov.js');
const istanbul = require('istanbul');
const fs = require('fs');
const tty = require('tty');
const commander = require('commander');
const childProcess = require('child_process');
const async = require('async');

const contains = _.contains;
const memoize = _.memoize;
const extend = _.extend;

/* eslint no-process-exit: 0 */
/* eslint no-eval: 1 */
/* jshint evil: true */

// Return the directory containing the test target sources
const target = () => {
  try {
    fs.lstatSync('lib');
    return 'lib';
  }
  catch (e) {
    return 'src';
  }
};

// Colorify the report on a tty or when requested on the command line
const colorify = memoize((opt) => tty.isatty(process.stdout) || opt.color);

// Run Mocha with Istanbul
const runCLI = () => {
  process.stdout.write('Testing...\n');

  // Parse command line options
  if (contains(process.argv, '--command')) {
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
    if (process.env.NO_ISTANBUL)
      commander.istanbul = false;
  }

  // Time the execution of the tests
  const t0 = Date.now();

  // Collect all test files
  const testDir = path.join(target(), 'test');
  const files = fs.readdirSync(testDir).filter(
    (file) => file.substr(-7) === 'test.js');

  // Execute all test files in child processes sequentially
  const collector = new istanbul.Collector();
  let sources = {};
  async.forEachSeries(files, (file, callback) => {
    // Collect child process arguments
    let args;
    if (contains(process.argv, '--command')) {
      args = [
        '--file', path.join(testDir, file)
      ];
      const index = process.argv.indexOf('--command');
      args = args.concat(process.argv.slice(index + 1));
    }
    else
      args = [
        '--file', path.join(testDir, file),
        '--istanbul-includes', commander.istanbulIncludes,
        '--timeout', commander.timeout
      ];
    if (!commander.istanbul)
      args.push('--no-istanbul');
    if (!colorify(commander))
      args.push('--no-color');

    // Spawn child process
    const child = childProcess.fork(__dirname + '/mocha.js', args);

    // Listen for message events from the child process
    child.on('message', (message) => {
      collector.add(message.coverage);
      sources = extend(sources, message.sources);
    });

    // Listen for exit events from the child process
    child.on('exit', (code) => {
      if (code != 0)
        callback(new Error('Child process exited with code ' + code));
      else
        callback();
    });

    // Listen for error events from the child process
    child.on('error', (err) => {
      callback(err);
    });
  }, (err) => {
    // Check for errors
    if (err) {
      process.stderr.write(err.message + '\n');
      process.exit(1);
    }

    // Time the execution of the tests
    const t1 = Date.now();

    // Print the test execution time
    const time = () =>{
      process.stdout.write(util.format('\nRun time %dms\n', t1 - t0));
    };

    if (!commander.istanbul) {
      time();
      process.exit(0);
    }

    // Write the JSON and LCOV coverage reports
    const coverage = collector.getFinalCoverage();
    const reporter = new istanbul.Reporter(undefined, '.coverage');
    reporter.addAll(['lcovonly']);
    reporter.write(collector, false, () => {
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
