'use strict';

// Convert Markdown to HTML

// Implemented in ES5 for now
/* eslint no-var: 0 */

var _ = require('underscore');
var hljs = require('highlight.js');
var hogan = require('hogan.js');
var inliner = require('html-inline');
var fs = require('fs');
var path = require('path');
var util = require('util');
var stream = require('stream');
var es = require('event-stream');
var request = require('request');
var commander = require('commander');

var wrap = _.wrap;

/* eslint no-empty: 1 */

// Install path.isAbsolute polyfill if needed
if(!path.isAbsolute)
  path.isAbsolute = require('path-is-absolute');

var runCLI = function(stdin, stdout) {
  // Parse command line options
  commander
    .parse(process.argv);

  var sin = stdin || process.stdin;
  var sout = stdout || process.stdout;

  // Require and configure markdown parser
  var md = require('markdown-it')({
    html: true,
    xhtmlOut: true,
    breaks: true,
    linkify: true,
    typographer: true,
    quotes: '“”‘’',
    highlight: function(str, lang) {
      if(lang && hljs.getLanguage(lang))
        try {
          return hljs.highlight(lang, str).value;
        }
        catch (e) {
          return '';
        }
      return '';
    }
  });

  // Read HTML Hogan template
  fs.readFile(path.resolve(__dirname, '../html/index.html'), function(err,
    template) {
    if(err) {
      process.stderr.write(util.format(
        'Couldn\'t read HTML template %s\n', err));
      return;
    }

    // Read markdown from input stream
    var input = [];
    sin.setEncoding('utf8');
    sin.on('data', function(chunk) {
      input.push(chunk);
    });
    sin.on('end', function() {
      // Render markdown input and merge into HTML template
      var html = hogan.compile(template.toString()).render({
        __mddoc: path.relative(process.cwd(),
          path.resolve(__dirname, '..')),
        __hljs: path.relative(process.cwd(),
          path.resolve(require.resolve('highlight.js'), '../..')),
        markdown: md.render(input.join())
      });

      // Inline all resources into a single self contained HTML page
      var s = new stream.Readable();
      s.push(html);
      s.push(null);
      fs.createReadStream = wrap(fs.createReadStream, function(fscrs,
        file) {
        // Get external resources using the request module
        var r = /.*\/(.*):\/(.*)/.exec(file);
        return r ? request.get(r.slice(1, 3).join('://')) : fscrs(file);
      });
      s.pipe(inliner({
        basedir: process.cwd()
      })).
        // Fix the svg content types
        pipe(es.replace(
          /"data:image\/svg.*;base64,/, '"data:image/svg+xml;base64,')).
        // Adjust the links to other markdown files
        pipe(es.replace(/\.md"/, '.html"')).
        // Write the final doc out
        pipe(sout);
    });
  });
};

module.exports.runCLI = runCLI;

