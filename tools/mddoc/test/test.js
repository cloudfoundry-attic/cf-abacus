'use strict';

// Convert Markdown to HTML

const stream = require('stream');
const util = require('util');

// Mock the request module
const request = require('request');
const img = '<an external image>';
const img64 = new Buffer(img).toString('base64');
request.get = spy(() => {
    const res = new stream.Readable();
    res.push(img);
    res.push(null);
    return res;
});

const mddoc = require('..');

describe('cf-abacus-mddoc', () => {
    it('converts Markdown to HTML', (done) => {
        // Simulate Markdown from stdin
        const stdin = new stream.Readable();
        stdin.push('# Title\ntext\n![test png](https://example.org/test.png)\n![test svg](https://example.org/test.svg)');
        stdin.push(null);

        // Capture stdout and check the generated HTML
        const chunks = [];
        const stdout = new stream.Writable();
        stdout._write = (chunk) => {
            chunks.push(chunk.toString());
            const html = chunk.toString();

            // Expect title and text from markdown
            expect(html).to.match(/<h1>Title/);
            expect(html).to.match(/<p>text/);

            // Expect the bootstrap and hljs css
            expect(html).to.match(/Bootstrap/);
            expect(html).to.match(/\.panel {/);
            expect(html).to.match(/.hljs {/);

            // Expect our css
            expect(html).to.match(/.language-json/);

            // Expect external images
            expect(request.get.args.length).to.equal(2);
            expect(request.get.args[0][0]).to.equal('https://example.org/test.png');
            expect(request.get.args[1][0]).to.equal('https://example.org/test.svg');
            expect(html).to.match(new RegExp(util.format('"data:image/png;base64,%s"', img64)));
            expect(html).to.match(new RegExp(util.format('"data:image/svg\\+xml;base64,%s"', img64)));

            // Include our css
            done();
        };

        // Run the converter
        mddoc.runCLI(stdin, stdout);
    });
});

