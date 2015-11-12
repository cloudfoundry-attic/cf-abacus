'use strict';

// Run Babel with our configuration

// Implemented in ES5 for now
/* eslint no-var: 0 */

var cp = require('child_process');
var path = require('path');
var commander = require('commander');

/* eslint no-process-exit: 1 */

var runCLI = function() {
  // Parse command line options
  commander
    .arguments('<dir>')
    .action(function(dir) {
      commander.dir = dir;
    })
    .parse(process.argv);

  var args = [
    '--compact', 'false', 
    '--presets', 'es2015', 
    /* '--auxiliary-comment-before', 'istanbul ignore next', */
    '--source-maps', 'inline',
    '--out-dir', 'lib', 'src'
  ].concat(commander.dir ? [commander.dir] : []);
  var babel = cp.spawn(path.resolve(
    __dirname, '../node_modules/.bin/babel'), args, {
      stdio: 'inherit'
    });
  babel.on('close', function(code) {
    process.exit(code);
  });
};

// Export our public functions
module.exports.runCLI = runCLI;

