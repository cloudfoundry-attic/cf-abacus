'use strict';

// A simple text code coverage reporter for Istanbul, as I prefer to see the
// code coverage right in the console where I run my tests instead of having
// go open a fancy HTML report in my Web browser each time.

var _ = require('underscore');
var tty = require('tty');
var path = require('path');
var util = require('util');

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
    return c === '\n' ? { line: pos.line + 1, column: 0 } : { line: pos.line, column: pos.column + 1 };
};

// Return source code annotated with colors or markup indicating code coverage
var annotatedSource = function(source, coveredSpans, uncoveredSpans, colorify) {
    // Use colors or markup tags to mark the covered code, uncovered code and
    // non-code text sections.
    var marks = colorify ?
        // Uncovered code is underlined red, covered code is green, non-code
        // text is blue
        {
            uncovered: { start: '\u001b[31m\u001b[4m', end: '\u001b[0m' },
            covered: { start: '\u001b[32m', end: '\u001b[0m' },
            text: { start: '\u001b[34m', end: '\u001b[0m' },
            none: { start: '\u001b[0m', end: '\u001b[0m' }
        } :
        {
            uncovered: { start: '<U>', end: '</U>' },
            covered: { start: '<C>', end: '</C>' },
            text: { start: '', end: '' },
            none: { start: '', end: '' }
        };

    // Return an array of characters representing the source document marked
    // with marks indicating covered code, uncovered code and text sections
    var markedSource = function(accum, c) {
        if(accum.length === 0) return _.extend(accum, { source: accum.source.concat([marks.end]) });

        // Determine if we are inside a covered code, uncovered code or text
        // section, and the corresponding mark
        var mark = c === '\n' ? marks.none : inside(accum.pos, uncoveredSpans) ? marks.uncovered : inside(accum.pos, coveredSpans) ? marks.covered : marks.text;

        return {
            source: accum.source.concat(mark !== accum.mark ? [accum.mark.end, mark.start, c] : [c]),
            length: accum.length - 1,
            pos: nextpos(accum.pos, c),
            mark: mark
        };
    };

    return _.reduce(source.split(''), markedSource, { source: [marks.text.start], length: source.length, pos: { line: 1, column: 0 }, mark: marks.text }).source.join('');
};

// Print code coverage from a list of Istanbul coverage objects and the
// corresponding sources
var printCoverage = function(coverage, sources) {
    _.map(_.values(coverage), function(cov) {
        var file = path.relative(process.cwd(), cov.path);

        // Compute the coverage percentage
        var scov = _.values(cov.s);
        var bcov = _.flatten(_.values(cov.b));
        var percent = (_.filter(scov, _.identity).length + _.filter(bcov, _.identity).length) / (scov.length + bcov.length) * 100;

        // Colorify the report on a tty or when the command line says --colors,
        // or when env variable COVERAGE_COLORS is configured
        var enabled = function(c) { return c !== undefined && c !== '0' && c !== 'false' && c !== 'disabled' && c !== 'no'; };
        var colorify = tty.isatty(process.stdout) || _.contains(process.argv, '--colors') || enabled(process.env.COVERAGE_COLORS);

        // Print summaries in green for 100% coverage and red under 100%
        var color = colorify ? percent === 100 ? '\u001b[32m' : '\u001b[31m' : '';
        var reset = colorify ? '\u001b[0m' : '';

        // Under 100% coverage, print the annotated source
        if(percent !== 100) {
            process.stdout.write(util.format('%sSource %s%s\n', color, file, reset));

            // Convert the Istanbul coverage statement and branch maps to lists
            // of covered and uncovered source spans
            var statements = _.zip(_.values(cov.s), _.values(cov.statementMap));
            var branches = _.zip(_.flatten(_.values(cov.b)), _.flatten(_.map(_.values(cov.branchMap), function(b) { return b.locations; })));
            var spans = _.union(statements, branches);
            var coveredSpans = _.map(_.filter(spans, function(s) { return s[0] === 1; }), function(s) { return s[1]; });
            var uncoveredSpans = _.map(_.filter(spans, function(s) { return s[0] === 0; }), function(s) { return s[1]; });

            // Print the annotated source
            process.stdout.write(annotatedSource(sources[cov.path], coveredSpans, uncoveredSpans, colorify));
            process.stdout.write('\n');
        }

        // Print line coverage percentage
        process.stdout.write(util.format('%sCoverage %d\% %s%s\n', color, percent.toFixed(2), file, reset));
    });
};

// Export our print function
module.exports = printCoverage;

