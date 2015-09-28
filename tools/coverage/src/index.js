'use strict';

// Report overall code coverage from Istanbul coverage files.

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var util = require('util');
var tty = require('tty');
var istanbul = require('istanbul');
var commander = require('commander');

var map = _.map;
var filter = _.filter;
var pairs = _.pairs;
var object = _.object;
var extend = _.extend;
var values = _.values;
var flatten = _.flatten;
var reduce = _.reduce;
var identity = _.identity;
var memoize = _.memoize;

/* eslint no-process-exit: 1 */

// Return the path of the Abacus module dir containing a file
var moddir = function(file) {
  if(file === '.' || file === '/') return undefined;
  if(/abacus.*/.test(path.basename(file))) return file;
  return moddir(path.dirname(file));
};

// Convert the covered file paths in the given coverage info to relative paths
// to the original source files
var sources = function(root, cov) {
  return object(filter(map(pairs(cov), function(file) {
    // Determine the build path and the name of the module containing each
    // covered file
    var mdir = moddir(file[0]);
    var mod = path.basename(mdir);

    // Determine the path to the module source directory
    var sdir = root.dependencies[mod] || root.devDependencies[mod];
    if(!sdir)
      return [file[0], file[1]];

    // Return a covered object with a relative path to the original source
    // of the covered file
    var rel = path.join(sdir,
      file[0].substr(mdir.length + 1)).split(':').reverse()[0].split('/');
    var l = rel.lastIndexOf('lib');
    var src = (l === -1 ? rel :
      rel.slice(0, l).concat(['src']).concat(rel.slice(l + 1))).join('/');
    return [src, extend({}, file[1], {
      path: src
    })];

  }), function(file) {
    return file[1];
  }));
};

// Return a list of all the individual json coverage files for our modules
var covfiles = function(cb) {
  fs.readdir('node_modules', function(err, files) {
    cb(undefined,
      filter([path.join('.coverage', 'coverage.json')]
        .concat(err ? [] : map(files, function(file) {
          return path.join('node_modules', file, '.coverage', 'coverage.json');
        })), fs.existsSync));
  });
};

// Return a coverage collector loaded with all the given files
var collect = function(root, cb) {
  covfiles(function(err, files) {
    if(err) cb(err);
    var collector = new istanbul.Collector();
    map(files, function(file) {
      collector.add(sources(root, JSON.parse(fs.readFileSync(file))));
    });
    cb(undefined, collector);
  });
};

// Compute overall line and statement coverage percentages
var percentages = function(coverage) {
  // Count overall covered and totals of lines, statements and branches
  var t = reduce(values(coverage), function(a, cov) {
    var l = values(cov.l);
    var s = values(cov.s);
    var b = flatten(values(cov.b));
    return {
      l: {
        covered: a.l.covered + filter(l, identity).length,
        total: a.l.total + l.length
      },
      s: {
        covered: a.s.covered + filter(s, identity).length,
        total: a.s.total + s.length
      },
      b: {
        covered: a.b.covered + filter(b, identity).length,
        total: a.b.total + b.length
      }
    };
  }, {
    l: {
      covered: 0,
      total: 0
    },
    s: {
      covered: 0,
      total: 0
    },
    b: {
      covered: 0,
      total: 0
    }
  });

  // Return the coverage percentages
  return {
    l: t.l.covered / (t.l.total || 1) * 100,
    s: (t.s.covered + /* t.b.covered */ 0) /
      (t.s.total + /* t.b.total */ 0 || 1) * 100
  };
};

// Colorify the report on a tty or when requested on the command line
var colorify = memoize(function(opt) {
  return tty.isatty(process.stdout) || opt.color;
});

// Report a failure and exit
var fail = function(msg) {
  process.stderr.write(msg);
  process.exit(1);
};

// Report overall code coverage from Istanbul coverage files
var runCLI = function() {
  // Parse command line options
  commander
    .option(
        '--no-color', 'do not colorify output')
    .parse(process.argv);

  // Load the root package.json from the current directory
  var root = JSON.parse(fs.readFileSync('package.json'));

  // Collect all the individual json coverage reports for our modules
  collect(root, function(err, collector) {
    if(err) fail(util.format('Couldn\'t collect coverage files', err));

    // Combine all the individual reports and write overall coverage
    // reports in LCOV and JSON formats
    var reporter = new istanbul.Reporter(undefined, '.coverage');
    reporter.addAll(['lcovonly', 'json']);
    reporter.write(collector, false, function(err) {
      if(err) fail(util.format('Couldn\'t write coverage reports', err, '\n'));

      // Compute and report overall line and statement coverage
      var percent = percentages(collector.getFinalCoverage());
      var fullcov = percent.l === 100 && percent.s === 100;

      // Print overall code coverage percentages in green for 100%
      // coverage and red under 100%
      var color = colorify(commander) ? fullcov ?
        '\u001b[32m' : '\u001b[31m' : '';
      var reset = colorify(commander) ? '\u001b[0m' : '';
      process.stdout.write(util.format(
        '\n%sOverall coverage lines %d\% statements %d\%%s\n\n',
        color, percent.l.toFixed(2), percent.s.toFixed(2), reset));

      process.exit(0);
    });
  });
};

// Export our public functions
module.exports.runCLI = runCLI;

