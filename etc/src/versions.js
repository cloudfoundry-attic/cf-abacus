'use strict';

// Print the versions of OS, Node and Npm

// Implemented in ES5 for now
/* eslint no-var: 0 */

var os = require('os');
var util = require('util');
var cp = require('child_process');

// Command line interface
var runCLI = function() {
  process.stdout.write(util.format('OS %s %s %s %s\n',
    os.type(), os.hostname(), os.release(), os.arch()));
  process.stdout.write(util.format('Node %s\n', process.version));
  cp.exec('npm --version', function(err, v) {
    var npmv = function(v) {
      process.stdout.write(util.format('Npm %s\n', v.trim()));
    };
    if(!err && v && v.trim() >= '2')
      npmv(v);
    else
      cp.exec('./node_modules/.bin/npm --version', function(err, lv) {
        return err || npmv(v || lv);
      });
  });
};

// Export our CLI
module.exports.runCLI = runCLI;

