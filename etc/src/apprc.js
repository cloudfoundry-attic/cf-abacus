'use strict';

// Print an environment variable from a .apprc file

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var strip = require('strip-json-comments');
var yaml = require('js-yaml');
var commander = require('commander');
var fs = require('fs');
var util = require('util');

var map = _.map;

// Parse JSON and Yaml
var parse = function(content) {
  if(/^\s*{/.test(content))
    return JSON.parse(strip(content));
  return yaml.load(content);
};

// Return the value of a variable under a given conf
var env = function(content, vars, name) {
  if(content[vars] && content[vars][name])
    return content[vars][name];
  return undefined;
};

// Display an environment variable from a given .apprc file, group
// and variable name
var runCLI = function() {
  // Parse command line options
  commander
    .arguments('<rcfile> <conf> <var>')
    .action(function(rcfile, conf, name) {
      commander.rcfile = rcfile;
      commander.conf = conf;
      commander.name = name;
    })
    .parse(process.argv);

  // Read the specified .apprc file
  fs.readFile(commander.rcfile, 'utf8',
    function(err, content) {
      if(err)
        return;
      // Parse the file
      var rc = parse(content);
      if(!rc)
        return;

      // Write the specified variable
      var val = env(rc, commander.conf, commander.name) ||
      env(rc, 'default', commander.name);
      map(typeof val === 'object' || typeof val === 'array' ? val : [val],
        function(v) {
          process.stdout.write(util.format('%s\n', v));
        });
    });
};

// Export our CLI
module.exports.runCLI = runCLI;

