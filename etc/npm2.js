'use strict';

// Run npm 2.x, install it if needed

var cp = require('child_process');

var run = function(cmd, cb) {
    cp.spawn(cmd, process.argv.slice(2), { stdio: 'inherit' }).on('close', function(code) { process.exit(code); });
};

// Command line interface
var runCLI = function() {
    cp.exec('npm --version', function(err, v) {
        if(v && v.trim() >= '2') return run('npm');
        var lnpm = 'node_modules/.bin/npm';
        cp.exec(lnpm + ' --version', function(err, v) {
            if(v && v.trim() >= '2') return run(lnpm);
            cp.spawn('npm', ['install', 'npm@2.10.1'], { stdio: 'inherit' }).on('close', function(code) {
                return code ? process.exit(code) : run(lnpm);
            });
        });
    });
};

// Export our CLI
module.exports.runCLI = runCLI;

