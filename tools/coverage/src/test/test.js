'use strict';

// Report overall code coverage from Istanbul coverage files.

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var istanbul = require('istanbul');
var fs = require('fs');

var bind = _.bind;

var coverage = require('..');

/* eslint handle-callback-err: 0 */

describe('abacus-coverage', function() {
  var exit;
  beforeEach(function() {
    exit = process.exit;
  });
  afterEach(function() {
    process.exit = exit;
  });

  xit('reports overall code coverage', function(done) {

    // Spy on the Istanbul coverage reporter
    var reporters = [];
    var Reporter = istanbul.Reporter;
    istanbul.Reporter = function(cfg, dir) {
      var reporter = new Reporter(cfg, dir);
      this.addAll = spy(bind(reporter.addAll, reporter));
      this.write = spy(bind(reporter.write, reporter));
      reporters.push(this);
    };

    // Mock process exit to get called back when the CLI exits
    process.exit = function(code) {
      // Expect exit code to be 0
      expect(code).to.equal(0);

      // Expect reporter.addAll to be called with some report types
      expect(reporters[0].addAll.args[0][0][0]).to.match(/^lcov.*/);
      expect(reporters[0].addAll.args[0][0][1]).to.match(/^json$/);

      // Expect reporter.write to be called with a collector
      var collector = reporters[0].write.args[0][0];
      expect(collector).to.not.equal(undefined);

      // Expect the collector to contain our main index file
      var files = collector.files();
      expect(files[0]).to.equal('tools/coverage/src/index.js');

      done();
    };

    // Setup a test coverage.json, expecting it to be picked up as part of
    // the overall module coverage
    fs.mkdir('.coverage', function() {
      fs.readFile('src/test/coverage.json', function(err, val) {
        fs.writeFile('.coverage/coverage.json', val, function() {
          // Run the coverage CLI
          coverage.runCLI();
        });
      });
    });
  });
});

