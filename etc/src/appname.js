'use strict';

// Print the name of an app

const commander = require('commander');
const path = require('path');
const util = require('util');

// Print the name of an app
const runCLI = () => {
  // Parse command line options
  commander
    .arguments('<dir>')
    .action((dir, conf, name) => {
      commander.dir = dir;
    })
    .parse(process.argv);

  // Load the app's package.json and print its name
  const mod = require(path.join(
    path.resolve(process.cwd(), commander.dir), 'package.json'));
  process.stdout.write(util.format('%s\n', mod.name));
};

// Export our CLI
module.exports.runCLI = runCLI;

