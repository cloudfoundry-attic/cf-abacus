'use strict';

// Small utility that pings a URL and waits for 5 successful pings

const request = require('./index.js');
const commander = require('commander');

// We use process.exit() intentionally here
/* eslint no-process-exit: 1 */

// Parse command line uri arg into a URI string or an options object
const parse = (uri) => {
  try {
    return JSON.parse(uri);
  }
  catch (e) {
    return uri;
  }
};

// Command line interface
const runCLI = () => {
  // Parse command line options
  commander
    .arguments('<uri>')
    .action((uri) => {
      commander.uri = uri;
    })
    .parse(process.argv);

  // Ping the target URI every 250 msec, for 5 sec max
  const opt = parse(commander.uri);
  console.log('Pinging %s', typeof opt === 'object' ? opt.uri : opt);
  request.waitFor(opt, function(err, val) {
    if(err) {
      console.log('Timed out');
      process.exit(1);
    }
    console.log('Ready');
    process.exit(0);
  });
};

// Export our public functions
exports.runCLI = runCLI;

