'use strict';

const fs = require('fs');
const tmp = require('tmp');
const execSync = require('child_process').execSync;

const execute = (command, showLog = true) => {
  if (showLog)
    console.log('> ' + command);
  const tmpFile = tmp.fileSync();
  const cmd = 'bash -c ' + 
    `"set -o pipefail; ${command} 2>&1 | tee ${tmpFile.name}"`;
  try {
    execSync(cmd, { stdio: [ 'ignore', process.stdout, process.stderr] });
    return fs.readFileSync(tmpFile.name).toString();
  }
  catch (err) {
    err.stderr = fs.readFileSync(tmpFile.name);
    throw err;
  }
  finally {
    tmpFile.removeCallback();
  }
};

module.exports.execute = execute;
