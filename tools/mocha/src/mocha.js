'use strict';

const Mocha = require('mocha');
const commander = require('commander');
const async = require('async');

/* eslint no-process-exit: 0 */
/* jshint evil: true */

// Run Mocha with Istanbul
const runCLI = () => {
  // Parse command line options
  commander
    .option('-f, --file <regex>', 'test file [test.js]', 'test.js')
    .option('--no-color', 'do not colorify output')
    .option('-t, --timeout <number>', 'timeout [60000]', 60000)
    .allowUnknownOption(true)
    .parse(process.argv);

  // Configure Mocha
  const mocha = new Mocha({
    timeout: commander.timeout,
    useColors: commander.color
  });

  // Install Chai expect and Sinon spy and stub as globals
  global.chai = require('chai');
  global.expect = global.chai.expect;
  global.sinon = require('sinon');
  global.spy = global.sinon.spy;
  global.stub = global.sinon.stub;
  global.assert = global.sinon.assert;

  // Save the original process send method as it may be mocked by the tests
  const processSend = process.send.bind(process);

  // Run the test with Mocha
  mocha.addFile(commander.file);
  mocha.run((failures) => {
    if (!global.__coverage) process.exit(failures);

    // Remap the generated source coverage maps using the collected source
    // maps
    remap(global.__coverage, maps);

    // Send the results to the parent process
    async.series(
      [
        (callback) => {
          processSend(
            {
              coverage: global.__coverage,
              sources: sources
            },
            (err) => {
              callback(err);
            }
          );
        }
      ],
      (err) => {
        process.exit(failures);
      }
    );
  });
};

runCLI();
