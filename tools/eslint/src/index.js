'use strict';

// Lint a module using ESLint

// Implemented in ES5 for now
/* eslint no-var: 0 */

var path = require('path');
var cli = require('eslint').cli;

// We use process.exit() intentionally here
/* eslint no-process-exit: 1 */

// Run the ESLint CLI
var runCLI = function() {
  var xc = cli.execute([process.argv[0], process.argv[1], '-c', path.resolve(
    __dirname, '../.eslintrc'), 'src']);

  // Wait for the stdout buffer to drain and return the exit code from ESLint
  process.on('exit', function() {
    process.exit(xc);
  });
};

// Export our module function
module.exports.runCLI = runCLI;
