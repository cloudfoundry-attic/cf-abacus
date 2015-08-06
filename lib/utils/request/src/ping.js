'use strict';

// Small utility that pings a URL and waits for 5 successful pings

// Implemented in ES5 for now
/* eslint no-var: 0 */

var request = require('./index.js');

// We use process.exit() intentionally here
/* eslint no-process-exit: 1 */

// Parse command line arg into a URI string or an options object
var parse = (arg) => {
  try {
    return JSON.parse(arg);
  }
  catch (e) {
    return arg;
  }
};
var opt = parse(process.argv[2]);

// Ping the target URI every 250 msec, for 5 sec max
console.log('Pinging %s', typeof opt === 'object' ? opt.uri : opt);
request.waitFor(opt, function(err, val) {
  if(err) {
    console.log('Timed out');
    process.exit(1);
  }
  console.log('Ready');
  process.exit(0);
});

