'use strict';

// Lint a module using ESLint

// Implemented in ES5 for now
/* eslint no-var: 0 */

var path = require('path');
var CLIEngine = require('eslint').CLIEngine;
var commander = require('commander');
var optionator = require('optionator');

// We use process.exit() intentionally here
/* eslint no-process-exit: 1 */

// Run the ESLint CLI
var runCLI = function() {
  // Parse command line options
  commander
    .parse(process.argv);

  var engine = new CLIEngine({
    eslintrc: true,
    ext: '.js',
    parser: 'espree',
    cache: false,
    ignore: true,
    stdin: false,
    quiet: false,
    color: true,
    maxWarnings: -1,
    fix: process.env.ESLINT_FIX !== undefined,
    configFile: path.resolve(__dirname, '../.eslintrc')
  });
  var files = optionator({
    options: []
  }).parse('src');
  var report = engine.executeOnFiles(files._);

  if (process.env.ESLINT_FIX)
    CLIEngine.outputFixes(report);

  var formatter = engine.getFormatter('stylish');
  var output = formatter(report.results);
  console.log(output);
  
  process.exit(report.errorCount ? 1 : 0);
};

// Export our module function
module.exports.runCLI = runCLI;

