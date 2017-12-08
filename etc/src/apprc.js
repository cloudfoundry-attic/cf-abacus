'use strict';

// Print an environment variable from a .apprc file

const _ = require('underscore');
const map = _.map;

const strip = require('strip-json-comments');
const yaml = require('js-yaml');
const commander = require('commander');
const fs = require('fs');
const util = require('util');

// Parse JSON and Yaml
const parse = (content) => {
  if (/^\s*{/.test(content)) return JSON.parse(strip(content));
  return yaml.load(content);
};

// Return the value of a variable under a given conf
const env = (content, vars, name) => {
  if (content[vars] && content[vars][name]) return content[vars][name];
  return undefined;
};

// Display an environment variable from a given .apprc file, group
// and variable name
const runCLI = () => {
  // Parse command line options
  commander
    .arguments('<rcfile> <conf> <var>')
    .action((rcfile, conf, name) => {
      commander.rcfile = rcfile;
      commander.conf = conf;
      commander.name = name;
    })
    .parse(process.argv);

  // Read the specified .apprc file
  fs.readFile(commander.rcfile, 'utf8', (err, content) => {
    if (err) return;
    // Parse the file
    const rc = parse(content);
    if (!rc) return;

    // Write the specified variable
    const val = env(rc, commander.conf, commander.name) || env(rc, 'default', commander.name);
    map(typeof val === 'object' || typeof val === 'array' ? val : [val], (v) => {
      process.stdout.write(util.format('%s\n', v));
    });
  });
};

// Export our CLI
module.exports.runCLI = runCLI;
