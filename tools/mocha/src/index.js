'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

// Test a module using Mocha

const recursiveReadSync = require('recursive-readdir-sync');

if (process.env.LONGJOHN) require('longjohn');

const _ = require('underscore');
const contains = _.contains;
const memoize = _.memoize;

const path = require('path');
const util = require('util');
const fs = require('fs');
const tty = require('tty');
const commander = require('commander');
const childProcess = require('child_process');
const async = require('async');

/* eslint no-process-exit: 0 */
/* jshint evil: true */

// Return the directory containing the test target sources
const target = () => {
  try {
    fs.lstatSync('lib');
    return 'lib';
  } catch (e) {
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
    commander.color = true;
    commander.file = 'test.js';
  } else
    commander
      .option('-f, --file <suffix>', 'test file should end with the suffix' + ' provided [test.js]', 'test.js')
      .option('--no-color', 'do not colorify output')
      .option('-t, --timeout <number>', 'timeout [60000]', 60000)
      .parse(process.argv);

  // Time the execution of the tests
  const t0 = Date.now();

  // Collect all test files
  const testDir = path.join(target(), 'test');
  const files = recursiveReadSync(testDir).filter((file) => file.endsWith(commander.file));

  // Execute all test files in child processes sequentially
  async.forEachSeries(
    files,
    (file, callback) => {
      // Collect child process arguments
      let args;
      if (contains(process.argv, '--command')) {
        args = ['--file', path.join(file)];
        const index = process.argv.indexOf('--command');
        args = args.concat(process.argv.slice(index + 1));
      } else
        args = [
          '--file',
          path.join(file),
          '--timeout',
          commander.timeout
        ];
      if (!colorify(commander)) args.push('--no-color');

      // Spawn child process
      const child = childProcess.fork(`${__dirname}/mocha.js`, args);

      // Listen for exit events from the child process
      child.on('exit', (code) => {
        if (code !== 0) callback(new Error('Child process exited with code ' + code));
        else callback();
      });

      // Listen for error events from the child process
      child.on('error', (err) => {
        callback(err);
      });
    },
    (err) => {
      // Check for errors
      if (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
      }

      // Time and print the execution of the tests
      const t1 = Date.now();
      process.stdout.write(util.format('\nRun time %dms\n', t1 - t0));
      process.exit(0);
    }
  );
};

// Export our public functions
module.exports.runCLI = runCLI;
