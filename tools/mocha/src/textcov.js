'use strict';

// A simple text code coverage reporter for Istanbul, as I prefer to see the
// code coverage right in the console where I run my tests instead of having
// go open a fancy HTML report in my Web browser each time.

const _ = require('underscore');
const path = require('path');
const util = require('util');

const reduce = _.reduce;
const extend = _.extend;
const values = _.values;
const filter = _.filter;
const identity = _.identity;
const map = _.map;
const zip = _.zip;
const flatten = _.flatten;
const union = _.union;

// Return true if a position is inside the given coverage spans
const inside = (pos, spans) =>
  reduce(
    spans,
    (i, span) =>
      i ||
      !(
        pos.line < span.start.line ||
        pos.line > span.end.line ||
        (pos.line === span.start.line && pos.column < span.start.column) ||
        (pos.line === span.end.line && pos.column >= span.end.column)
      ),
    false
  );

// Return the next position in the source document given a character
const nextpos = (pos, c) =>
  c === '\n'
    ? {
        line: pos.line + 1,
        column: 0
      }
    : {
        line: pos.line,
        column: pos.column + 1
      };

// Return source code annotated with colors or markup indicating code coverage
const annotatedSource = (source, coveredSpans, uncoveredSpans, opt) => {
  // Use colors or markup tags to mark the covered code, uncovered code and
  // non-code text sections.
  const marks = opt.color
    ? {
        // Uncovered code is underlined red, covered code is green, non-code
        // text is blue
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
      }
    : {
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
  const markedSource = (accum, c) => {
    if (accum.length === 0)
      return extend(accum, {
        source: accum.source.concat([marks.end])
      });

    // Determine if we are inside a covered code, uncovered code or text
    // section, and the corresponding mark
    const mark =
      c === '\n'
        ? marks.none
        : inside(accum.pos, uncoveredSpans)
          ? marks.uncovered
          : inside(accum.pos, coveredSpans) ? marks.covered : marks.text;

    return {
      source: accum.source.concat(mark !== accum.mark ? [accum.mark.end, mark.start, c] : [c]),
      length: accum.length - 1,
      pos: nextpos(accum.pos, c),
      mark: mark
    };
  };

  return reduce(source.split(''), markedSource, {
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
const inThisModule = (cov) => {
  const rel = path.relative(process.cwd(), cov.path);
  return /^(src|lib)\/([^\/]*\/)?[^\/]*\.js$/.test(rel);
};

// Compute line and statement coverage percentages
const percentages = (cov) => {
  const lcov = values(cov.l);
  const scov = values(cov.s);
  return {
    l: filter(lcov, identity).length / (lcov.length || 1) * 100,
    s: filter(scov, identity).length / (scov.length || 1) * 100
  };
};

// Print code coverage from a list of Istanbul coverage objects and the
// corresponding sources
const printCoverage = (coverage, sources, opt) => {
  map(filter(values(coverage), inThisModule), (cov) => {
    const file = path.relative(process.cwd(), cov.path);

    // Compute the coverage percentages
    const percent = percentages(cov);
    let fullcov = percent.l === 100 && percent.s === 100;

    // Print code coverage in green for 100% coverage and red under 100%
    const color = opt.color ? (fullcov ? '\u001b[32m' : '\u001b[31m') : '';
    const reset = opt.color ? '\u001b[0m' : '';

    // Under 100% coverage, print the annotated source
    if (!fullcov) {
      process.stdout.write(util.format('%sSource %s%s\n', color, file, reset));

      // Convert the Istanbul coverage statement and branch maps to lists
      // of covered and uncovered source spans
      const statements = zip(values(cov.s), values(cov.statementMap));
      const branches = zip(
        flatten(values(cov.b)),
        flatten(
          map(values(cov.branchMap), (b) => {
            return b.locations;
          })
        )
      );
      const spans = union(statements, branches);
      const coveredSpans = map(filter(spans, (s) => s[0] === 1), (s) => s[1]);
      const uncoveredSpans = map(filter(spans, (s) => s[0] === 0), (s) => s[1]);

      // Print the annotated source
      process.stdout.write(annotatedSource(sources[cov.path], coveredSpans, uncoveredSpans, opt));
      process.stdout.write('\n');
    }

    // Print line and statement coverage percentages
    process.stdout.write(
      util.format(
        '%sCoverage lines %d% statements %d% %s%s\n',
        color,
        percent.l.toFixed(2),
        percent.s.toFixed(2),
        file,
        reset
      )
    );
  });
};

// Export our print function
module.exports = printCoverage;
