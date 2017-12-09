'use strict';

// Print the name of an app

const commander = require('commander');
const fs = require('fs');
const yaml = require('js-yaml');
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

  // Load the app's manifest and print its name
  const manifestPath = path.join(path.resolve(process.cwd(), commander.dir), 'manifest.yml');
  const content = fs.readFileSync(manifestPath);
  const manifest = yaml.load(content);
  process.stdout.write(util.format('%s\n', manifest.applications[0].name));
};

// Export our CLI
module.exports.runCLI = runCLI;
