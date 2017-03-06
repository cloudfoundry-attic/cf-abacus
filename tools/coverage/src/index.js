'use strict';

// Report overall code coverage from Istanbul coverage files.

const _ = require('underscore');
const path = require('path');
const fs = require('fs');
const util = require('util');
const tty = require('tty');
const istanbul = require('istanbul');
const commander = require('commander');

const map = _.map;
const filter = _.filter;
const pairs = _.pairs;
const object = _.object;
const extend = _.extend;
const values = _.values;
const flatten = _.flatten;
const reduce = _.reduce;
const identity = _.identity;
const memoize = _.memoize;

/* eslint no-process-exit: 1 */

// Return the path of the Abacus module dir containing a file
const moduleDir = (file) => {
  if (file === '.' || file === '/') return __dirname;
  if (/abacus.*/.test(path.basename(file))) return file;
  return moduleDir(path.dirname(file));
};

// Convert the covered file paths in the given coverage info to relative paths
// to the original source files
const sources = (root, cov) => {
  return object(filter(map(pairs(cov), (file) => {
    // Determine the build path and the name of the module containing each
    // covered file
    const mdir = moduleDir(file[0]);
    const mod = path.basename(mdir);

    // Determine the path to the module source directory
    const sdir = root.dependencies[mod] || root.devDependencies[mod];
    if (!sdir)
      return [file[0], file[1]];

    // Return a covered object with a relative path to the original source
    // of the covered file
    const src = path.join(sdir,
      file[0].substr(mdir.length + 1)).split(':').reverse()[0];
    return [src, extend({}, file[1], { path: src })];

  }), (file) => {
    return file[1];
  }));
};

// Return a list of all the individual json coverage files for our modules
const covfiles = (cb) => {
  fs.readdir('node_modules', (err, files) => {
    cb(undefined, filter([path.join('.coverage', 'coverage.json')].
      concat(err ? [] : map(files, (file) => {
        return path.join('node_modules', file, '.coverage', 'coverage.json');
      })), fs.existsSync)
    );
  });
};

// Return a coverage collector loaded with all the given files
const collect = (root, cb) => {
  covfiles((err, files) => {
    if (err) cb(err);
    const collector = new istanbul.Collector();
    map(files, (file) => {
      collector.add(sources(root, JSON.parse(fs.readFileSync(file))));
    });
    cb(undefined, collector);
  });
};

// Compute overall line and statement coverage percentages
const percentages = (coverage) => {
  // Count overall covered and totals of lines, statements and branches
  const t = reduce(values(coverage), (a, cov) => {
    const l = values(cov.l);
    const s = values(cov.s);
    const b = flatten(values(cov.b));
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
const colorify = memoize((opt) => {
  return tty.isatty(process.stdout) || opt.color;
});

// Report a failure and exit
const fail = (msg) => {
  process.stderr.write(msg);
  process.exit(1);
};

// Report overall code coverage from Istanbul coverage files
const runCLI = () => {
  // Parse command line options
  commander
    .option(
      '--no-color', 'do not colorify output')
    .parse(process.argv);

  // Load the root package.json from the current directory
  const root = JSON.parse(fs.readFileSync('package.json'));

  // Collect all the individual json coverage reports for our modules
  collect(root, (err, collector) => {
    if (err) fail(util.format('Couldn\'t collect coverage files', err));

    // Combine all the individual reports and write overall coverage
    // reports in LCOV and JSON formats
    const reporter = new istanbul.Reporter(undefined, '.coverage');
    reporter.addAll(['lcovonly', 'json']);
    reporter.write(collector, false, (err) => {
      if (err) fail(util.format('Couldn\'t write coverage reports', err, '\n'));

      // Compute and report overall line and statement coverage
      const percent = percentages(collector.getFinalCoverage());
      const fullcov = percent.l === 100 && percent.s === 100;

      // Print overall code coverage percentages in green for 100%
      // coverage and red under 100%
      const color = colorify(commander) ? fullcov ?
          '\u001b[32m' : '\u001b[31m' : '';
      const reset = colorify(commander) ? '\u001b[0m' : '';
      process.stdout.write(util.format(
        '\n%sOverall coverage lines %d\% statements %d\%%s\n\n',
        color, percent.l.toFixed(2), percent.s.toFixed(2), reset));

      process.exit(0);
    });
  });
};

// Export our public functions
module.exports.runCLI = runCLI;

