'use strict';

// Print the versions of OS, Node and Npm

const os = require('os');
const util = require('util');
const cp = require('child_process');

// Command line interface
const runCLI = () => {
  process.stdout.write(util.format('OS %s %s %s %s\n',
    os.type(), os.hostname(), os.release(), os.arch()));
  process.stdout.write(util.format('Node %s\n', process.version));
  cp.exec('npm --version', (err, v) => {
    const npmv = (v) => {
      process.stdout.write(util.format('Npm %s\n', v.trim()));
    };
    if(!err && v && v.trim() >= '2')
      npmv(v);
    else
      cp.exec('./node_modules/.bin/npm --version',
        (err, lv) => err || npmv(v || lv));
  });
};

// Export our CLI
module.exports.runCLI = runCLI;

