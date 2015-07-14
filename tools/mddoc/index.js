'use strict';

// Convert Markdown to HTML

var hljs = require('highlight.js');
var hogan = require('hogan.js');
var inliner = require('html-inline');
var fs = require('fs');
var path = require('path');
var util = require('util');
var stream = require('stream');

/* eslint no-empty: 1 */

var runCLI = function() {

    // Require and configure markdown parser
    var md = require('markdown-it')({
        html: true,
        xhtmlOut: true,
        breaks: true,
        linkify: true,
        typographer: true,
        quotes: '“”‘’',
        highlight: function(str, lang) {
            if (lang && hljs.getLanguage(lang))
                try {
                    return hljs.highlight(lang, str).value;
                }
                catch (e) {}
            return '';
        }
    });

    // Read HTML Hogan template
    fs.readFile(path.resolve(__dirname, './html/index.html'), function(err, template) {
        if(err) {
            process.stderr.write(util.format('Couldn\'t read HTML template %s\n', err));
            return;
        }

        // Read markdown from stdin
        var input = [];
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', function(chunk) {
            input.push(chunk);
        });
        process.stdin.on('end', function() {
            // Render markdown input and merge into HTML template
            var html = hogan.compile(template.toString()).render({ markdown: md.render(input.join()) });

            // Inline all resources into a single self contained HTML page
            var s = new stream.Readable();
            s.push(html);
            s.push(null);
            s.pipe(inliner({ basedir: __dirname })).pipe(process.stdout);
        });
    });
};

module.exports.runCLI = runCLI;

