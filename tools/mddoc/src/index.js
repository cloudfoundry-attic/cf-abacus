'use strict';

// Convert Markdown to HTML

const _ = require('underscore');
const hljs = require('highlight.js');
const hogan = require('hogan.js');
const inliner = require('html-inline');
const fs = require('fs');
const path = require('path');
const util = require('util');
const stream = require('stream');
const es = require('event-stream');
const request = require('request');
const commander = require('commander');

const wrap = _.wrap;

/* eslint no-empty: 1 */

const runCLI = (stdin, stdout) => {
  // Parse command line options
  commander.parse(process.argv);

  const sin = stdin || process.stdin;
  const sout = stdout || process.stdout;

  // Require and configure markdown parser
  const md = require('markdown-it')({
    html: true,
    xhtmlOut: true,
    breaks: true,
    linkify: true,
    typographer: true,
    quotes: '“”‘’',
    highlight: (str, lang) => {
      if (lang && hljs.getLanguage(lang))
        try {
          return hljs.highlight(lang, str).value;
        } catch (e) {
          return '';
        }
      return '';
    }
  });

  // Read HTML Hogan template
  fs.readFile(path.resolve(__dirname, '../html/index.html'), (err, template) => {
    if (err) {
      process.stderr.write(util.format("Couldn't read HTML template %s\n", err));
      return;
    }

    // Read markdown from input stream
    const input = [];
    sin.setEncoding('utf8');
    sin.on('data', (chunk) => {
      input.push(chunk);
    });
    sin.on('end', () => {
      // Render markdown input and merge into HTML template
      const html = hogan.compile(template.toString()).render({
        __mddoc: path.relative(process.cwd(), path.resolve(__dirname, '..')),
        __hljs: path.relative(process.cwd(), path.resolve(require.resolve('highlight.js'), '../..')),
        markdown: md.render(input.join())
      });

      // Inline all resources into a single self contained HTML page
      const s = new stream.Readable();
      s.push(html);
      s.push(null);
      fs.createReadStream = wrap(fs.createReadStream, (fscrs, file) => {
        // Get external resources using the request module
        const r = /.*\/(.*):\/(.*)/.exec(file);
        return r ? request.get(r.slice(1, 3).join('://')) : fscrs(file);
      });
      s
        .pipe(
          inliner({
            basedir: process.cwd()
          })
        )
        // Fix the svg content types
        .pipe(es.replace(/"data:image\/svg.*;base64,/, '"data:image/svg+xml;base64,'))
        // Adjust the links to other markdown files
        .pipe(es.replace(/\.md"/, '.html"'))
        // Write the final doc out
        .pipe(sout);
    });
  });
};

module.exports.runCLI = runCLI;
