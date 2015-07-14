'use strict';

// Print the versions of OS, Node and Npm

var os = require('os');
var util = require('util');
var cp = require('child_process');

// Command line interface
var runCLI = function() {
    process.stdout.write(util.format('OS %s %s %s %s\n', os.type(), os.hostname(), os.release(), os.arch()));
    process.stdout.write(util.format('Node %s\n', process.version));
    cp.exec('npm --version', function(err, stdout, stderr) { process.stdout.write(util.format('Npm %s\n', stdout.trim())); });
};

// Export our CLI
module.exports.runCLI = runCLI;

