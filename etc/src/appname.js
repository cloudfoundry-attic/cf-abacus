'use strict';

// Print the name of an app

// Implemented in ES5 for now
/* eslint no-var: 0 */

var commander = require('commander');
var path = require('path');
var util = require('util');

// Print the name of an app
var runCLI = function() {
  // Parse command line options
  commander
    .arguments('<dir>')
    .action(function(dir, conf, name) {
      commander.dir = dir;
    })
    .parse(process.argv);

  // Load the app's package.json and print its name
  var mod = require(path.join(
    path.resolve(process.cwd(), commander.dir), 'package.json'));
  process.stdout.write(util.format('%s\n', mod.name));
};

// Export our CLI
module.exports.runCLI = runCLI;

