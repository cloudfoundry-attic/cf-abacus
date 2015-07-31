'use strict';

// Run Babel with our configuration

// Implemented in ES5 for now
/* eslint no-var: 0 */

var cp = require('child_process');
var path = require('path');

/* eslint no-process-exit: 1 */

var runCLI = function() {
    var args = ['--babelrc', path.resolve(__dirname, '../.babelrc'), '--out-dir', 'lib', 'src'].concat(process.argv.slice(2));
    var babel = cp.spawn(path.resolve(__dirname, '../node_modules/.bin/babel'), args, { stdio: 'inherit' });
    babel.on('close', function(code) { process.exit(code); });
};

// Export our public functions
module.exports.runCLI = runCLI;

