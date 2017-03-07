'use strict';

// Lint a module using ESLint

const path = require('path');
const CLIEngine = require('eslint').CLIEngine;
const commander = require('commander');
const optionator = require('optionator');

// We use process.exit() intentionally here
/* eslint no-process-exit: 1 */

// Run the ESLint CLI
const runCLI = () => {
  // Parse command line options
  commander
    .parse(process.argv);

  const engine = new CLIEngine({
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
  const files = optionator({
    options: []
  }).parse('src');
  const report = engine.executeOnFiles(files._);

  if (process.env.ESLINT_FIX)
    CLIEngine.outputFixes(report);

  const formatter = engine.getFormatter('stylish');
  const output = formatter(report.results);
  console.log(output);

  process.exit(report.errorCount ? 1 : 0);
};

// Export our module function
module.exports.runCLI = runCLI;

