'use strict';

const _ = require('underscore');
const path = require('path');
const smap = require('source-map');
const csmap = require('convert-source-map');
const istanbul = require('istanbul');
const Mocha = require('mocha');
const fs = require('fs');
const commander = require('commander');
const async = require('async');

const map = _.map;
const values = _.values;

/* eslint no-process-exit: 0 */
/* eslint no-eval: 1 */
/* jshint evil: true */

// Return true if a file belongs to the current module
const inThisModule = (file) => {
  const rel = path.relative(process.cwd(), file);
  return /^(src|lib)\/([^\/]*\/)?[^\/]*\.js$/.test(rel);
};

// Return true if a file is in a test directory
const inTestDir = (file) =>{
  const rel = path.relative(process.cwd(), file);
  return /^(src|lib)\/test\//.test(rel);
};

// Return a file matcher function that will return true if a file should be
// instrumented with Istanbul. The matcher will match files in the current
// module or any module name matching the given include pattern, excluding
// files in test directories.
const instrumentMatcher = (include) => {
  const ix = new RegExp('\/' + include + '[^\/]*\/lib\/([^\/]*\/)?[^\/]*\.js$');
  const inIncludedModule = (file) => ix.test(file);
  return (file) => (inThisModule(file) || inIncludedModule(file)) &&
    !inTestDir(file);
};

// Return a transform function that transforms a file and records the original
// source and a source map in the given sets
const transformer = (sources, maps, transformers) => {
  // Set up an instrument function that will instrument the relevant code
  const instrumenter = new istanbul.Instrumenter({
    coverageVariable: '__coverage',
    preserveComments: true
  });

  // Return the configured transform function
  return (code, file) => {
    // Skip files that contain /istanbul ignore file/
    if (/istanbul ignore file/.test(code))
      return code;

    if (transformers[file])
      return transformers[file];

    // Save the original source of each instrumented file
    sources[file] = fs.readFileSync(file).toString();

    // Record the corresponding source map
    const sm = csmap.fromSource(code);
    if (sm)
      maps[file] = new smap.SourceMapConsumer(sm.sourcemap);

    // Instrument with Istanbul
    const transformer = instrumenter.instrumentSync(code, file);
    transformers[file] = transformer;
    return transformer;
  };
};

// Remap Istanbul statement, function and branch coverage maps to the original
// source code using the given set of source maps
const remap = (coverage, maps) =>{
  map(values(coverage), (cov) => {
    const m = maps[cov.path];
    if (!m) return;

    const reloc = (l) => {
      const start = m.originalPositionFor(l.start);
      if (start.line !== null)
        l.start = start;
      const end = m.originalPositionFor(l.end);
      if (end.line !== null)
        l.end = end;
    };

    map(values(cov.statementMap), (s) => {
      reloc(s);
    });
    map(values(cov.fnMap), (f) => {
      reloc(f.loc);
      f.line = f.loc.start.line;
    });
    map(values(cov.branchMap), (b) => {
      map(b.locations, (l) => {
        reloc(l);
      });
      b.line = b.locations[0].start.line;
    });
  });
  return coverage;
};

// Run Mocha with Istanbul
const runCLI = () => {
  // Parse command line options
  commander
    .option('-f, --file <regex>', 'test file [test.js]', 'test.js')
    .option('--no-istanbul', 'do not instrument with Istanbul')
    .option('-i, --istanbul-includes <regex>',
      'instrument matching modules with Istanbul [abacus]', 'abacus')
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

  // Install an Istanbul require hook that will instrument files that
  // match our instrumentMatcher
  const sources = {};
  const maps = [];
  const transformers = [];
  if (commander.istanbul)
    istanbul.hook.hookRequire(
      instrumentMatcher(commander.istanbulIncludes),
      transformer(sources, maps, transformers));

  // Save the original process send method as it may be mocked by the tests
  const processSend = process.send.bind(process);

  // Run the test with Mocha
  mocha.addFile(commander.file);
  mocha.run((failures) => {
    if (!global.__coverage)
      process.exit(failures);

    // Remap the generated source coverage maps using the collected source
    // maps
    remap(global.__coverage, maps);

    // Send the results to the parent process
    async.series([
      (callback) =>{
        processSend({
          coverage: global.__coverage,
          sources: sources
        }, (err) => {
          callback(err);
        });
      }
    ], (err) => {
      process.exit(failures);
    });
  });
};

runCLI();
