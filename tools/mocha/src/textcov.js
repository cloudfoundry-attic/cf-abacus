'use strict';

// A simple text code coverage reporter for Istanbul, as I prefer to see the
// code coverage right in the console where I run my tests instead of having
// go open a fancy HTML report in my Web browser each time.

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var tty = require('tty');
var path = require('path');
var util = require('util');

var contains = _.contains;

// Return true if a position is inside the given coverage spans
var inside = function(pos, spans) {
  return _.reduce(spans, function(i, span) {
    return i || !(pos.line < span.start.line || pos.line > span.end.line ||
      pos.line === span.start.line && pos.column < span.start.column ||
      pos.line === span.end.line && pos.column >= span.end.column);
  }, false);
};

// Return the next position in the source document given a character
var nextpos = function(pos, c) {
  return c === '\n' ? {
    line: pos.line + 1,
    column: 0
  } : {
    line: pos.line,
    column: pos.column + 1
  };
};

// Return source code annotated with colors or markup indicating code coverage
var annotatedSource = function(source, coveredSpans, uncoveredSpans, colors) {
  // Use colors or markup tags to mark the covered code, uncovered code and
  // non-code text sections.
  var marks = colors ?
    // Uncovered code is underlined red, covered code is green, non-code
    // text is blue
    {
      uncovered: {
        start: '\u001b[31m\u001b[4m',
        end: '\u001b[0m'
      },
      covered: {
        start: '\u001b[32m',
        end: '\u001b[0m'
      },
      text: {
        start: '\u001b[34m',
        end: '\u001b[0m'
      },
      none: {
        start: '\u001b[0m',
        end: '\u001b[0m'
      }
    } :
    {
      uncovered: {
        start: '<U>',
        end: '</U>'
      },
      covered: {
        start: '<C>',
        end: '</C>'
      },
      text: {
        start: '',
        end: ''
      },
      none: {
        start: '',
        end: ''
      }
    };

  // Return an array of characters representing the source document marked
  // with marks indicating covered code, uncovered code and text sections
  var markedSource = function(accum, c) {
    if(accum.length === 0) return _.extend(accum, {
        source: accum.source.concat([marks.end])
      });

    // Determine if we are inside a covered code, uncovered code or text
    // section, and the corresponding mark
    var mark = c === '\n' ? marks.none : inside(accum.pos, uncoveredSpans) ?
      marks.uncovered : inside(accum.pos, coveredSpans) ? marks.covered :
        marks.text;

    return {
      source: accum.source.concat(mark !== accum.mark ? [accum.mark.end,
        mark.start, c
      ] : [c]),
      length: accum.length - 1,
      pos: nextpos(accum.pos, c),
      mark: mark
    };
  };

  return _.reduce(source.split(''), markedSource, {
    source: [marks.text.start],
    length: source.length,
    pos: {
      line: 1,
      column: 0
    },
    mark: marks.text
  }).source.join('');
};

// Return true if a file belongs to the current module or a subdirectory of
// that module
var inThisModule = function(cov) {
  var rel = path.relative(process.cwd(), cov.path);
  return /^lib\/[^\/]*\.js$/.test(rel) ||
    /^lib\/[^\/]*\/[^\/]*\.js$/.test(rel);
};

// Compute line and statement coverage percentages
var percentages = function(cov) {
  var lcov = _.values(cov.l);
  var scov = _.values(cov.s);
  return {
    l: _.filter(lcov, _.identity).length / (lcov.length || 1) * 100,
    s: _.filter(scov, _.identity).length / (scov.length || 1) * 100
  };
};

// Colorify the report on a tty or when the command line says --colors,
// or when env variable COVERAGE_COLORS is configured
var colors = _.memoize(function() {
  var enabled = function(c) {
    return c !== undefined && c !== '0' && c !== 'false' && c !==
      'disabled' && c !== 'no';
  };
  return tty.isatty(process.stdout) ||
    contains(process.argv, '--colors') || enabled(process.env.COVERAGE_COLORS);
});

// Print code coverage from a list of Istanbul coverage objects and the
// corresponding sources
var printCoverage = function(coverage, sources) {
  _.map(_.filter(_.values(coverage), inThisModule), function(cov) {
    var file = path.relative(process.cwd(), cov.path);

    // Compute the coverage percentages
    var percent = percentages(cov);
    var fullcov = percent.l === 100 && percent.s === 100;

    // Print code coverage in green for 100% coverage and red under 100%
    var color = colors() ? fullcov ? '\u001b[32m' : '\u001b[31m' : '';
    var reset = colors() ? '\u001b[0m' : '';

    // Under 100% coverage, print the annotated source
    if(!fullcov) {
      process.stdout.write(util.format('%sSource %s%s\n', color, file, reset));

      // Convert the Istanbul coverage statement and branch maps to lists
      // of covered and uncovered source spans
      var statements = _.zip(_.values(cov.s), _.values(cov.statementMap));
      var branches = _.zip(_.flatten(_.values(cov.b)),
        _.flatten(_.map(_.values(cov.branchMap), function(b) {
        return b.locations;
      })));
      var spans = _.union(statements, branches);
      var coveredSpans = _.map(_.filter(spans, function(s) {
        return s[0] === 1;
      }), function(s) {
        return s[1];
      });
      var uncoveredSpans = _.map(_.filter(spans, function(s) {
        return s[0] === 0;
      }), function(s) {
        return s[1];
      });

      // Print the annotated source
      process.stdout.write(annotatedSource(sources[cov.path],
        coveredSpans, uncoveredSpans, colors()));
      process.stdout.write('\n');
    }

    // Print line and statement coverage percentages
    process.stdout.write(util.format(
      '%sCoverage lines %d\% statements %d\% %s%s\n',
      color, percent.l.toFixed(2), percent.s.toFixed(2), file, reset));
  });
};

// Export our print function
module.exports = printCoverage;

